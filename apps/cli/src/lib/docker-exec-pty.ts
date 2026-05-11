/**
 * Spec 0072 — run an interactive command inside the profile container with a
 * real PTY, by shelling out to `docker exec -it <container> <cmd>` via
 * node-pty (a host PTY).
 *
 * Earlier attempts via `dockerode.exec({Tty:true,hijack:true})` could write
 * to the hijacked stream (drained=true) but the inner `claude setup-token`
 * never observed the input. node-pty + docker exec gives a real PTY that
 * cooperates with the container's tty line-discipline and the inner CLI's
 * readline path.
 *
 * Used by `runClaudeOAuth` to spawn `claude setup-token` inside the
 * container, capture the OAuth URL/token from stdout via regex matchers,
 * and forward the operator-pasted code to the spawned PTY's stdin.
 */

import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import * as pty from 'node-pty';

/**
 * Resolve the absolute path to `docker` once at module-load time. node-pty's
 * `posix_spawnp` doesn't honor PATH the same way `child_process.spawn` does —
 * spawning bare `docker` returns `posix_spawnp failed`. Resolving via
 * `which` and passing the absolute path is the workaround.
 */
function resolveDockerBin(): string {
  const r = spawnSync('which', ['docker'], { encoding: 'utf8' });
  const path = (r.stdout ?? '').trim();
  return path || 'docker';
}
const DOCKER_BIN = resolveDockerBin();

/**
 * node-pty ships its prebuilt `spawn-helper` binary (the program posix_spawnp
 * actually launches; it then exec()s the target command) without the
 * executable bit set in some pnpm installs. The result is a generic
 * `posix_spawnp failed.` at runtime. Chmod +x once at load time.
 */
function ensureSpawnHelperExecutable(): void {
  if (process.platform === 'win32') return;
  try {
    const req = createRequire(import.meta.url);
    const pkgPath = req.resolve('node-pty/package.json');
    const pkgDir = dirname(pkgPath);
    const platDir = `${process.platform}-${process.arch}`;
    const helper = join(pkgDir, 'prebuilds', platDir, 'spawn-helper');
    if (!existsSync(helper)) return;
    const mode = statSync(helper).mode & 0o777;
    if ((mode & 0o111) === 0) {
      chmodSync(helper, mode | 0o755);
    }
  } catch {
    // Best effort — if this fails, pty.spawn will surface the original error.
  }
}
ensureSpawnHelperExecutable();

const ESC = '\\x1b';
const BEL = '\\x07';
const ANSI_PATTERNS: readonly RegExp[] = [
  new RegExp(`${ESC}\\[[0-9;?]*[ -/]*[@-~]`, 'g'),
  new RegExp(`${ESC}\\][^${BEL}${ESC}]*(${BEL}|${ESC}\\\\)`, 'g'),
  new RegExp(`${ESC}[()][AB012]`, 'g'),
  new RegExp(`${ESC}[78=>]`, 'g'),
];

export function stripAnsi(s: string): string {
  let out = s;
  for (const re of ANSI_PATTERNS) out = out.replace(re, '');
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
  /** Container name (e.g. `zeno-test-0072`). */
  containerName: string;
  /** Argv to run inside the container (e.g. `['claude', 'setup-token']`). */
  cmd: string[];
  /**
   * Called once the PTY is alive, before any matcher fires. Receives a
   * `write` fn the caller uses to send bytes to the spawned process's stdin.
   */
  onReady?: (write: (data: string) => void) => void;
  matchers: PtyMatcher[];
  /** PTY columns. Defaults to 200 so wrapped URLs/tokens stay on one line. */
  cols?: number;
  rows?: number;
  /** Optional mirror — every chunk also written here. Pass `null` to silence. */
  mirror?: NodeJS.WritableStream | null;
  /** Hard timeout in ms. Defaults to 5 min. */
  timeoutMs?: number;
}

export interface RunDockerExecPtyResult {
  exitCode: number | null;
  signal: number | null;
  timedOut: boolean;
}

function normalize(chunk: string): string {
  return stripAnsi(chunk).replace(/[\r\n]+/g, '');
}

/**
 * Spawn `docker exec -it <containerName> <cmd>` via node-pty. Resolves when
 * the spawned process exits. Matchers fire at-most-once as their regexes
 * match the running ANSI-stripped buffer.
 */
export async function runDockerExecPty(
  opts: RunDockerExecPtyOpts,
): Promise<RunDockerExecPtyResult> {
  const cols = opts.cols ?? 200;
  const rows = opts.rows ?? 40;
  const mirror =
    opts.mirror === undefined ? process.stdout : opts.mirror === null ? null : opts.mirror;

  // `-i` keeps stdin open; `-t` allocates the container-side TTY. Together
  // with node-pty's host-side PTY, this gives a real bidirectional terminal.
  const args = ['exec', '-i', '-t', opts.containerName, ...opts.cmd];
  const term = pty.spawn(DOCKER_BIN, args, {
    name: 'xterm-256color',
    cols,
    rows,
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', TERM: 'xterm-256color' },
  });

  let buffer = '';
  const fired = new Set<string>();
  let timedOut = false;

  const timer = setTimeout(
    () => {
      timedOut = true;
      try {
        term.kill();
      } catch {
        /* ignore */
      }
    },
    opts.timeoutMs ?? 5 * 60 * 1000,
  );

  term.onData((chunk: string) => {
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
        if (r instanceof Promise) r.catch(() => undefined);
      }
    }
  });

  if (opts.onReady) {
    opts.onReady((data: string) => {
      term.write(data);
    });
  }

  const result = await new Promise<RunDockerExecPtyResult>((resolve) => {
    term.onExit(({ exitCode, signal }) => {
      clearTimeout(timer);
      resolve({ exitCode, signal: signal ?? null, timedOut });
    });
  });

  return result;
}
