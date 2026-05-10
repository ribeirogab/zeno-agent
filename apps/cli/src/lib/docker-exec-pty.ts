/**
 * Spec 0072 — run an interactive command inside the profile container with a
 * TTY, proxying stdio between the host CLI and the docker exec session.
 *
 * Used by `runClaudeOAuth` to spawn `claude setup-token` inside the
 * container, capture the OAuth URL/token from stdout via regex matchers, and
 * forward the operator-pasted code to the container's stdin.
 *
 * No precedent for this pattern in the rest of the repo (the api spawns
 * `claude setup-token` LOCALLY via node-pty inside its own container; the
 * CLI runs on the host so it cannot do the same).
 */

import { type Duplex, Readable } from 'node:stream';
import type Dockerode from 'dockerode';

const ESC = '\\x1b';
const BEL = '\\x07';
const ANSI_PATTERNS: readonly RegExp[] = [
  // CSI (ESC [ … letter)
  new RegExp(`${ESC}\\[[0-9;?]*[ -/]*[@-~]`, 'g'),
  // OSC (ESC ] … BEL or ESC \)
  new RegExp(`${ESC}\\][^${BEL}${ESC}]*(${BEL}|${ESC}\\\\)`, 'g'),
  // Charset designator
  new RegExp(`${ESC}[()][AB012]`, 'g'),
  // Single-byte ESC sequences
  new RegExp(`${ESC}[78=>]`, 'g'),
];

export function stripAnsi(s: string): string {
  let out = s;
  for (const re of ANSI_PATTERNS) {
    out = out.replace(re, '');
  }
  return out;
}

export interface PtyMatcher {
  /** Unique label for at-most-once firing. */
  name: string;
  /** Regex applied against the running ANSI-stripped buffer. */
  regex: RegExp;
  /** Called with `match[1]` (or full match if no capture group). At-most-once. */
  onMatch: (value: string) => void | Promise<void>;
}

export interface RunDockerExecPtyOpts {
  /** Container to exec into. Must be running. */
  container: Pick<Dockerode.Container, 'exec'>;
  /** Argv (e.g. ['claude', 'setup-token']). First element is the binary. */
  cmd: string[];
  /** Forwarded into the exec stdin stream. CLI typically passes process.stdin. */
  stdin: Readable;
  matchers: PtyMatcher[];
  /** PTY columns. Defaults to 200 so wrapped URLs stay on one logical line. */
  cols?: number;
  rows?: number;
  /** Optional mirror — every chunk is also written here (defaults to process.stdout). Pass `null` to silence. */
  mirror?: NodeJS.WritableStream | null;
}

export interface RunDockerExecPtyResult {
  exitCode: number | null;
}

/** Strip-then-flatten newlines so wrapped URLs reassemble in the buffer. */
function normalize(chunk: Buffer | string): string {
  return stripAnsi(typeof chunk === 'string' ? chunk : chunk.toString('utf8')).replace(
    /[\r\n]+/g,
    '',
  );
}

/**
 * Run `cmd` inside the container with a PTY. Resolves when the exec stream
 * ends. Matchers fire at-most-once as their regexes match the running
 * buffer.
 */
export async function runDockerExecPty(
  opts: RunDockerExecPtyOpts,
): Promise<RunDockerExecPtyResult> {
  const exec = await opts.container.exec({
    Cmd: opts.cmd,
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: true,
  });

  // start({ hijack: true, stdin: true }) returns a single bidirectional
  // Duplex stream when Tty=true (no docker multiplex header).
  const stream = (await exec.start({ hijack: true, stdin: true })) as Duplex;

  let buffer = '';
  const fired = new Set<string>();
  const mirror =
    opts.mirror === undefined ? process.stdout : opts.mirror === null ? null : opts.mirror;

  const onData = (chunk: Buffer | string): void => {
    if (mirror) mirror.write(chunk);
    buffer += normalize(chunk);
    if (buffer.length > 65_536) buffer = buffer.slice(-32_768);
    for (const m of opts.matchers) {
      if (fired.has(m.name)) continue;
      const match = m.regex.exec(buffer);
      if (match) {
        fired.add(m.name);
        const value = match[1] ?? match[0];
        const r = m.onMatch(value);
        // Swallow promise rejections from matchers — they should not abort the
        // exec stream. Caller is responsible for surfacing user-visible errors.
        if (r instanceof Promise) r.catch(() => undefined);
      }
    }
  };

  stream.on('data', onData);
  opts.stdin.pipe(stream);

  await new Promise<void>((resolve) => {
    stream.once('end', resolve);
    stream.once('close', resolve);
  });

  let exitCode: number | null = null;
  try {
    const inspect = await exec.inspect();
    exitCode = inspect.ExitCode ?? null;
  } catch {
    /* container died mid-exec — propagate as null */
  }
  return { exitCode };
}
