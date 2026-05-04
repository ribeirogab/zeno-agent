/**
 * Spec 0071 — in-process registry of in-flight OAuth sessions.
 *
 * Spawns the backend's auto-flow CLI (today: `claude setup-token`) under a
 * pseudo-terminal (node-pty) because the CLI:
 *   1. Detects no TTY → output buffered + ASCII art emitted in pieces. Without
 *      PTY the URL prints garbled or never reaches stdout.
 *   2. Is bidirectional. After printing the OAuth URL it WAITS for the
 *      operator to paste back the `code` parameter from the Anthropic
 *      callback page. The CLI then exchanges code → access token and prints
 *      the token to stdout.
 *
 * Protocol the dashboard sees over SSE:
 *   device_code_url { url } — first event, URL to open
 *   awaiting_code   {}      — CLI is now waiting on stdin for the code
 *   token_captured  {}      — token regex matched in stdout
 *   verifying       {}      — server-side verification handshake started
 *   success         {}      — token saved encrypted
 *   error           { kind, message } — terminal failure
 *
 * Operator pastes the code into a separate POST endpoint
 * (`/oauth/:session/input`) which calls `sendInput()` here → PTY stdin.
 *
 * Per-api-process registry, 5-minute hard timeout, multi-profile isolation
 * inherited from spec 0050 (one api container per profile).
 */

import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import * as pty from 'node-pty';

export type OAuthEvent =
  | { type: 'device_code_url'; url: string }
  | { type: 'awaiting_code' }
  | { type: 'status'; text: string }
  | { type: 'token_captured' }
  | { type: 'verifying' }
  | { type: 'success' }
  | {
      type: 'error';
      kind: 'cli' | 'unauthorized' | 'rate_limited' | 'network';
      message: string;
      retryAfterSec?: number;
    };

export interface OAuthSession {
  id: string;
  emitter: EventEmitter;
  /** Populated only after a `token_captured` event. Server-side only — never
   *  emitted to the SSE wire. The route reads it to run the verification
   *  handshake. Wiped after the session terminates. */
  capturedToken: string | null;
  /** Forward stdin to the PTY (e.g. operator pasting the OAuth code). The CLI
   *  reads it on its next read; we append `\r` to fire the line. */
  sendInput(text: string): void;
  cancel(): void;
}

export interface OAuthRegistryOpts {
  /** Argv to spawn — first element is the binary, rest are args. */
  command: string[];
  /** Regex matched against (ANSI-stripped, line-flattened) stdout; group 1 = device-code URL. */
  urlRegex: RegExp;
  /** Regex matched against (ANSI-stripped) stdout; group 1 = OAuth token. */
  tokenRegex: RegExp;
  /** Regex matched against (ANSI-stripped) stdout to detect the "paste code"
   *  prompt. When it matches we emit `awaiting_code` so the UI can reveal
   *  the code-input field. */
  awaitingCodeRegex?: RegExp;
  /** Hard timeout in ms. Defaults to 5 minutes. */
  timeoutMs?: number;
  /** PTY columns. Use a wide value so wrapped URLs stay on one line — the URL
   *  regex assumes no embedded line breaks. */
  cols?: number;
  rows?: number;
  /** Optional logger for boot-time observability. */
  logger?: { info: (o: object, m: string) => void; warn: (o: object, m: string) => void };
}

/** Strip CSI / OSC / common ANSI escape sequences from a chunk so regexes can
 *  match the underlying text. Conservative — leaves printable chars intact.
 *
 *  Regexes are built via `new RegExp(string)` instead of regex literals so the
 *  ESC byte (0x1b) appears as the escape sequence `\x1b` in source. Biome's
 *  `noControlCharactersInRegex` rule flags literal control chars inside regex
 *  literals, but not regexes constructed from runtime strings.
 */
const ESC = '\\x1b';
const BEL = '\\x07';
const ANSI_PATTERNS: readonly RegExp[] = [
  // CSI (ESC [ … letter)
  new RegExp(`${ESC}\\[[0-9;?]*[ -/]*[@-~]`, 'g'),
  // OSC (ESC ] … BEL or ESC \)
  new RegExp(`${ESC}\\][^${BEL}${ESC}]*(${BEL}|${ESC}\\\\)`, 'g'),
  // Charset designator (ESC ( or ESC ) + B/A/0/1/2)
  new RegExp(`${ESC}[()][AB012]`, 'g'),
  // Single-byte ESC sequences (DECSC/DECRC/keypad/cursor mode)
  new RegExp(`${ESC}[78=>]`, 'g'),
];

function stripAnsi(s: string): string {
  let out = s;
  for (const re of ANSI_PATTERNS) {
    out = out.replace(re, '');
  }
  return out;
}

export class OAuthRegistry {
  private sessions = new Map<string, OAuthSession & { term: pty.IPty; timer: NodeJS.Timeout }>();

  start(opts: OAuthRegistryOpts): OAuthSession {
    const id = randomUUID();
    const emitter = new EventEmitter();
    const [cmd, ...args] = opts.command;
    if (!cmd) throw new Error('OAuthRegistry: empty command');

    const cols = opts.cols ?? 200;
    const rows = opts.rows ?? 40;
    const term = pty.spawn(cmd, args, {
      name: 'xterm-256color',
      cols,
      rows,
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', TERM: 'xterm-256color' },
    });

    const timeoutMs = opts.timeoutMs ?? 5 * 60 * 1000;
    const timer = setTimeout(() => {
      emitter.emit('event', {
        type: 'error',
        kind: 'cli',
        message: 'OAuth flow timed out (5 min)',
      } satisfies OAuthEvent);
      try {
        term.kill();
      } catch {
        // ignore
      }
    }, timeoutMs);

    let buffer = '';
    let urlEmitted = false;
    let awaitingCodeEmitted = false;
    /** Spec 0071 debug aid: redact OAuth tokens in any string before logging.
     *  We never log the buffer wholesale, only summaries. Defense-in-depth. */
    const redactToken = (s: string): string =>
      s.replace(/sk-ant-oat\d{2}-[A-Za-z0-9_-]+/g, 'sk-ant-oat<redacted>');

    term.onData((chunk: string) => {
      // Flatten newlines in the running buffer so wrapped URLs reassemble.
      // Some terminals send \r\n; replace whole CR/LF with empty for matching
      // (we don't surface buffer contents anywhere user-visible).
      const cleaned = stripAnsi(chunk).replace(/[\r\n]+/g, '');
      buffer += cleaned;
      if (buffer.length > 65_536) buffer = buffer.slice(-32_768);

      if (!urlEmitted) {
        const m = buffer.match(opts.urlRegex);
        if (m?.[1]) {
          urlEmitted = true;
          emitter.emit('event', {
            type: 'device_code_url',
            url: m[1],
          } satisfies OAuthEvent);
        }
      }

      if (urlEmitted && !awaitingCodeEmitted && opts.awaitingCodeRegex) {
        if (opts.awaitingCodeRegex.test(buffer)) {
          awaitingCodeEmitted = true;
          emitter.emit('event', { type: 'awaiting_code' } satisfies OAuthEvent);
        }
      }

      const t = buffer.match(opts.tokenRegex);
      if (t?.[1] && !session.capturedToken) {
        session.capturedToken = t[1];
        emitter.emit('event', { type: 'token_captured' } satisfies OAuthEvent);
      }
    });

    term.onExit(({ exitCode }) => {
      clearTimeout(timer);
      // Spec 0071 — when no token was captured, dump a redacted tail of the
      // buffer to logs so we can see what the CLI printed in the post-code
      // phase (e.g. invalid-code error, unexpected token format). Tail is
      // capped to 600 chars and tokens are redacted.
      const tail = redactToken(buffer.slice(-600));
      buffer = '';
      if (!session.capturedToken) {
        opts.logger?.warn(
          {
            event: 'oauth_session_exit_no_token',
            sessionId: id,
            exitCode,
            urlEmitted,
            awaitingCodeEmitted,
            tail,
          },
          'oauth session exited without capturing token',
        );
        emitter.emit('event', {
          type: 'error',
          kind: 'cli',
          message: `claude setup-token exited ${exitCode}`,
        } satisfies OAuthEvent);
      } else {
        opts.logger?.info(
          { event: 'oauth_session_exit_ok', sessionId: id, exitCode },
          'oauth session captured token + cli exited',
        );
      }
      this.sessions.delete(id);
    });

    const session: OAuthSession & { term: pty.IPty; timer: NodeJS.Timeout } = {
      id,
      emitter,
      capturedToken: null,
      term,
      timer,
      sendInput: (text: string) => {
        // Spec 0071: claude-code's setup-token uses Ink TextInput. When we
        // write `${trimmed}\r` as one chunk, Ink batches the keystrokes and
        // the trailing `\r` gets consumed as part of the buffered input
        // instead of firing onSubmit. Splitting the write — text first, then
        // a small delay, then the CR — lets Ink's reconciler tick between
        // the input update and the Enter event so onSubmit fires reliably.
        const trimmed = text.trim();
        const preTail = redactToken(buffer.slice(-300));
        opts.logger?.info(
          {
            event: 'oauth_session_input_forwarded',
            sessionId: id,
            length: trimmed.length,
            preTail,
          },
          'forwarded operator input to CLI stdin (length only — never the value)',
        );
        term.write(trimmed);
        // Two Enter strategies in sequence — different TUIs (Ink, Inquirer,
        // readline) prefer different bytes. Sending CR first, then LF as
        // fallback after 200ms covers both. The CLI exits on the first one
        // that fires onSubmit; the second is a no-op against a finished proc.
        setTimeout(() => term.write('\r'), 100);
        setTimeout(() => term.write('\n'), 300);
        // 2s post-input buffer snapshot so we can see how the CLI reacted
        // (accepted? rejected? redrew prompt?). Token-redacted.
        setTimeout(() => {
          opts.logger?.info(
            {
              event: 'oauth_session_post_input_snapshot',
              sessionId: id,
              postTail: redactToken(buffer.slice(-400)),
            },
            'buffer state 2s after sending input',
          );
        }, 2000);
      },
      cancel: () => {
        clearTimeout(timer);
        try {
          term.kill();
        } catch {
          // ignore
        }
        this.sessions.delete(id);
      },
    };
    this.sessions.set(id, session);
    opts.logger?.info({ event: 'oauth_session_started', sessionId: id }, 'oauth session started');
    return session;
  }

  get(id: string): OAuthSession | null {
    return this.sessions.get(id) ?? null;
  }

  /** Test-only — clears all in-flight sessions. */
  _clear(): void {
    for (const s of this.sessions.values()) {
      try {
        s.cancel();
      } catch {
        // ignore
      }
    }
    this.sessions.clear();
  }
}
