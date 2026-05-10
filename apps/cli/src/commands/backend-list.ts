/**
 * Spec 0072 — `zeno backend list` — table of backends configured for a profile.
 *
 * Joins the on-disk catalog with the runtime DB `backend_credentials`
 * statuses for the resolved profile. Backends in the catalog but not in
 * the DB show as `not_configured`.
 */

import { loadBackendsCatalog, type BackendsCatalog } from '@zeno/backends';
import type { BackendCredentialStatus } from '@zeno/db/runtime';
import { defineCommand } from 'citty';
import { c, isQuiet, setQuiet } from '../lib/output.js';
import { resolveProfile } from '../lib/resolvers.js';
import { openProfileRuntimeDb } from '../lib/runtime-db.js';

export type BackendRowStatus =
  | 'active'
  | 'expired'
  | 'untested'
  | 'failed'
  | 'not_configured';

export interface BackendRow {
  id: string;
  name: string;
  status: BackendRowStatus;
  lastTestedAt: number | null;
}

export function buildBackendRows(
  catalog: BackendsCatalog,
  statuses: BackendCredentialStatus[],
): BackendRow[] {
  const byId = new Map(statuses.map((s) => [s.backendId, s] as const));
  return catalog.backends.map((b) => {
    const s = byId.get(b.id);
    return {
      id: b.id,
      name: b.name,
      status: (s?.status ?? 'not_configured') as BackendRowStatus,
      lastTestedAt: s?.lastTestedAt ?? null,
    };
  });
}

function tsLabel(ts: number | null): string {
  if (ts === null) return 'never';
  return new Date(ts).toISOString().slice(0, 16).replace('T', ' ');
}

export default defineCommand({
  meta: { name: 'list', description: 'list backends configured for a profile' },
  args: {
    profile: { type: 'string', description: 'profile identifier (omit for sticky/picker)' },
    json: { type: 'boolean', description: 'emit JSON' },
    quiet: { type: 'boolean', description: 'minimal output' },
  },
  async run({ args }) {
    if (args.quiet) setQuiet(true);
    const profile = await resolveProfile(args.profile as string | undefined);
    const handle = openProfileRuntimeDb({
      profile: profile.name,
      masterKeyHex: profile.masterKey,
    });
    try {
      const catalog = loadBackendsCatalog();
      const statuses = handle.backendCredentialsRepo.listStatuses();
      const rows = buildBackendRows(catalog, statuses);
      if (args.json) {
        process.stdout.write(`${JSON.stringify(rows)}\n`);
        return;
      }
      if (!isQuiet()) {
        console.log('');
        console.log(
          `  ${c.bold('backend'.padEnd(14))} ${c.bold('status'.padEnd(16))} ${c.bold('last test')}`,
        );
      }
      for (const row of rows) {
        console.log(`  ${row.id.padEnd(14)} ${row.status.padEnd(16)} ${tsLabel(row.lastTestedAt)}`);
      }
      if (!isQuiet()) console.log('');
    } finally {
      handle.close();
    }
  },
});
