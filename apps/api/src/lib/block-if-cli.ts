/**
 * Spec 2026-05-11 (channels CLI-first): shared CLI-only mutation gate. Originally
 * defined inline in `connectors.ts`; lifted here so the channels route registers
 * the same check without duplicating logic.
 *
 * Contract: callers invoke `blockIfCli(c, opts)` at the top of a mutating handler.
 * Returns a `Response` when the request must be rejected (HTTP 403, JSON body
 * `{ error: 'mode_cli_only', action, cli }`) or `null` when the handler should
 * proceed. The 403 body carries the equivalent `zeno …` command so the
 * dashboard can render it inside `<CommandModal>` with no extra round-trip.
 *
 * `X-Zeno-Origin: cli` bypasses the gate. The CLI sets this header on every
 * outbound request via `ApiClientImpl`; the dashboard never sets it.
 */
import type { Context } from 'hono';
import type { ApiWriteMode } from './api-mode.js';

export interface BlockIfCliOpts {
  /** Current API write mode (resolved from `ZENO_API_WRITES` at server boot). */
  writes: ApiWriteMode;
  /** Short action discriminator for the response body (e.g. `'install'`, `'rotate'`). */
  action: string;
  /** Equivalent CLI invocation rendered to the operator (e.g. `'zeno channel rotate <slug>'`). */
  cli: string;
}

/**
 * Returns a 403 Response when the gate fires, or `null` when the caller should
 * proceed. Callers must `return` the response immediately when non-null.
 *
 * Example:
 * ```ts
 * const blocked = blockIfCli(c, { writes: deps.writes, action: 'rotate', cli: 'zeno channel rotate <slug>' });
 * if (blocked) return blocked;
 * ```
 */
export function blockIfCli(c: Context, opts: BlockIfCliOpts): Response | null {
  if (opts.writes === 'cli' && c.req.header('x-zeno-origin') !== 'cli') {
    return c.json({ error: 'mode_cli_only', action: opts.action, cli: opts.cli }, 403);
  }
  return null;
}
