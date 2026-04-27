/**
 * Spawn helper for the echo-mcp fixture used by spec 0037 Phase A tests.
 *
 * Cleanup contract: every scenario MUST assign the result to a describe-scoped
 * `let fixture: Fixture | null = null` and clean up via:
 *
 *   afterEach(() => { fixture?.stop(); fixture = null; });
 *
 * Inline cleanup in the test body is fragile under failure (the cleanup never
 * fires if an assertion throws first), causing leaked child processes. Use
 * `afterEach` always.
 */

import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { resolve } from 'node:path';

export type FailMode = 'spawn' | 'auth' | 'mcp_error' | 'timeout';

export interface Fixture {
  /** Path to `node` (spawning command). */
  command: string;
  /** Args, ready to pass to a stdio MCP transport. */
  args: string[];
  /** Env to inject (caller passes this through to `discoverTools` via the connector secret env mapping). */
  env: Record<string, string>;
  /** Kill the child. Idempotent. */
  stop: () => void;
  /** Capture stdio output for debugging on failure. */
  dumpOutput: () => string;
}

const FIXTURE_PATH = resolve(__dirname, '..', 'fixtures', 'echo-mcp', 'server.mjs');

/**
 * Boot the echo fixture as a child process. Returns a `Fixture` describing
 * how to invoke it (the `discoverTools` helper consumes `command` + `args`)
 * plus a `stop()` cleanup hook.
 *
 * For tests using `discoverTools`, pass `command` + `args` into the
 * `Connector.command` / `Connector.args` fields and let `discoverTools`
 * spawn its own child. For tests using a direct `MCP Client`, spawn the
 * command yourself. This helper does NOT itself keep a child alive in
 * the parent test process — `stop()` is a no-op when no child was spawned.
 */
export function bootFixture(opts: { failMode?: FailMode } = {}): Fixture {
  const env: Record<string, string> = {};
  if (opts.failMode) {
    env.FIXTURE_FAIL = opts.failMode;
  }

  let child: ChildProcessWithoutNullStreams | null = null;
  const buffers: string[] = [];

  return {
    command: 'node',
    args: [FIXTURE_PATH],
    env,
    stop: () => {
      if (child && !child.killed) {
        try {
          child.kill('SIGTERM');
        } catch {
          // best effort
        }
        child = null;
      }
    },
    dumpOutput: () => buffers.join(''),
  };
}

/**
 * Resolved path to the fixture script. Exposed for tests that want to
 * spawn the fixture directly (e.g., to use a raw `Client` instead of
 * `discoverTools`).
 */
export const FIXTURE_SCRIPT_PATH = FIXTURE_PATH;
