/**
 * Spec 0072 — orchestrate the claude OAuth flow inside the profile container.
 *
 * Spawns the catalog's `auto_flow.command` (today: `claude setup-token`) via
 * dockerode.exec PTY, parses the URL out of stdout via the catalog regex,
 * prompts the operator for the OAuth code, forwards the code to the
 * container's stdin, then captures the resulting OAuth token from stdout
 * via the catalog token regex.
 *
 * Returns the captured token as a plaintext string. Throws if the flow
 * exits without capturing a token (most common cause: operator cancelled).
 */

import { runDockerExecPty } from './docker-exec-pty.js';

export interface ClaudeOAuthBackend {
  id: string;
  auto_flow: {
    command: string[];
    stdout_url_regex: string;
    stdout_token_regex: string;
    stdout_awaiting_code_regex?: string;
  };
}

export interface ClaudeOAuthOpts {
  /** Profile container name (e.g. `zeno-test-0072`). Must be running. */
  containerName: string;
  /** Catalog entry from @zeno/backends with auto_flow regexes. */
  backend: ClaudeOAuthBackend;
  /** Prompts the operator for the OAuth code (hidden input recommended). */
  promptCode: (url: string) => Promise<string>;
  /** Optional mirror — passed to runDockerExecPty. */
  mirror?: NodeJS.WritableStream | null;
}

/**
 * Returns the captured OAuth token. Throws if the spawned CLI exits without
 * one (caller decides how to surface to operator).
 */
export async function runClaudeOAuth(opts: ClaudeOAuthOpts): Promise<string> {
  const flow = opts.backend.auto_flow;
  const urlRe = new RegExp(flow.stdout_url_regex);
  const tokenRe = new RegExp(flow.stdout_token_regex);
  const awaitingRe = flow.stdout_awaiting_code_regex
    ? new RegExp(flow.stdout_awaiting_code_regex)
    : null;

  let url: string | null = null;
  let token: string | null = null;
  let codeSent = false;
  let stdinWrite: ((data: string) => void) | null = null;

  const sendCode = async (): Promise<void> => {
    if (codeSent || !url) return;
    codeSent = true;
    const code = await opts.promptCode(url);
    process.stderr.write(`[oauth-dbg] code received (len=${code.length}); writing to stdin\n`);
    if (!stdinWrite) {
      process.stderr.write('[oauth-dbg] WARN no stdinWrite available\n');
      return;
    }
    // claude setup-token uses an interactive TUI readline that hangs when
    // fed long input as one atomic block (verified empirically: < ~70 char
    // batches process; ≥ ~80 char batches show the chars masked as `*` but
    // never fire on the trailing `\r`). Mimic actual typing by writing one
    // char at a time with a small delay; readline handles each keypress
    // cleanly and fires on the final CR. Real OAuth codes are ~92 chars so
    // this matters in practice.
    for (const ch of code) {
      stdinWrite(ch);
      await new Promise((r) => setTimeout(r, 5));
    }
    await new Promise((r) => setTimeout(r, 50));
    stdinWrite('\r');
    process.stderr.write(`[oauth-dbg] code written to pty (${code.length} chars chunked)\n`);
  };

  const dbg = (msg: string) => process.stderr.write(`[oauth-dbg] ${msg}\n`);

  const matchers = [
    {
      name: 'url',
      regex: urlRe,
      onMatch: (v: string) => {
        url = v;
        dbg(`url captured (len=${v.length})`);
        if (!awaitingRe) {
          // No awaiting-code prompt → ask immediately after URL is captured.
          void sendCode();
        }
      },
    },
    {
      name: 'token',
      regex: tokenRe,
      onMatch: (v: string) => {
        token = v;
        dbg(`token captured (len=${v.length}, prefix=${v.slice(0, 12)}...)`);
        // No need to close stdin — the spawned CLI exits on its own once it
        // prints the token. Closing the duplex stream early can also tear
        // down the stdout half before we capture the final byte.
      },
    },
  ];

  if (awaitingRe) {
    matchers.push({
      name: 'awaiting',
      regex: awaitingRe,
      onMatch: () => {
        dbg('awaiting-code regex matched');
        void sendCode();
      },
    });
  }

  const opts2: Parameters<typeof runDockerExecPty>[0] = {
    containerName: opts.containerName,
    cmd: flow.command,
    matchers,
    onReady: (write) => {
      stdinWrite = write;
    },
  };
  if (opts.mirror !== undefined) opts2.mirror = opts.mirror;
  await runDockerExecPty(opts2);

  if (!token) {
    throw new Error(`OAuth flow for ${opts.backend.id} exited without capturing a token`);
  }
  return token;
}
