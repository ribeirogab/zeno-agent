// Single source of truth for "what is the live state of this profile?".
//
// Background: the host DB column `profiles.status` records what the CLI
// *believes* a profile's container is doing. When the operator runs
// `docker stop` (or anything else) out-of-band, that column goes stale —
// the DB still says `running` even though the container is gone.
//
// Every CLI call site that surfaces a profile's state — `zeno status`,
// `zeno profile list`, `zeno profile show`, the picker hint in
// `lib/resolvers.ts:resolveProfile` — must consult the Docker daemon
// first, only falling back to the DB when the daemon itself is
// unreachable. Inlined per-call-site, that pattern drifted: the original
// `zeno status` fix (#3 / df5a4a2) was correct but the same bug remained
// in three other places. This helper centralises it.
//
// Contract: when the daemon is reachable but the container is missing
// (or in any non-running terminal state), `resolveLiveStatus` returns
// `'stopped'`, *overriding* whatever the DB recorded. When the daemon is
// unreachable we cannot tell, so we fall back to `p.status` — at least
// stale-but-best-known is preferable to lying with `stopped`.
//
// `doctor.ts` also consumes `snapshotLive`, but its drift detection
// intentionally compares DB-vs-live and is *not* expected to use
// `resolveLiveStatus` (which would mask the very drift it's looking for).

import type { ProfileRow } from '@zeno/db/host';
import { orchestrator } from './orchestrator/singleton.js';
import type { Status } from './output.js';

export interface LiveSnapshot {
  /** True when `orchestrator().listManagedContainers()` returned without throwing. */
  reachable: boolean;
  /** Container state keyed by profile name (e.g. `'fn' → 'running'`). */
  liveByName: Map<string, Status>;
}

/**
 * Snapshot the live container state for every Zeno-managed container in a
 * single Docker round-trip. Callers should snapshot once per command run and
 * pass the result through `resolveLiveStatus` for each profile they render.
 *
 * Failures are absorbed into `{ reachable: false, liveByName: empty }` so
 * downstream call sites can fall back to DB state without try/catch noise.
 */
export async function snapshotLive(): Promise<LiveSnapshot> {
  try {
    const live = await orchestrator().listManagedContainers();
    return {
      reachable: true,
      liveByName: new Map(live.map((l) => [l.profile, l.state])),
    };
  } catch {
    return { reachable: false, liveByName: new Map() };
  }
}

/**
 * Map a profile row to its operator-visible state, preferring live container
 * state over the DB cache. When the daemon is unreachable we have no choice
 * but to surface the stale DB value.
 */
export function resolveLiveStatus(p: ProfileRow, snap: LiveSnapshot): Status {
  if (!snap.reachable) return p.status as Status;
  return (snap.liveByName.get(p.name) ?? 'stopped') as Status;
}
