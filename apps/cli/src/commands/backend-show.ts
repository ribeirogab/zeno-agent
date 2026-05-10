/**
 * Spec 0072 — `zeno backend show <slug>` — detail block for a single backend.
 *
 * Prints status, scope (always `profile · aes-256-gcm` for now since every
 * cred is encrypted with the profile master key), last test ts, rotated ts.
 */

import { loadBackendsCatalog } from '@zeno/backends';
import { defineCommand } from 'citty';
import { c, err, isQuiet, setQuiet } from '../lib/output.js';
import { resolveProfile } from '../lib/resolvers.js';
import { openProfileRuntimeDb } from '../lib/runtime-db.js';

export interface BackendDetail {
  id: string;
  name: string;
  status: string;
  lastTestedAt: number | null;
  scope: string;
}

function ts(n: number | null): string {
  if (n === null) return 'never';
  return new Date(n).toISOString();
}

export function formatBackendDetail(d: BackendDetail): string {
  return [
    `${c.bold(d.id)}  ${c.gray(d.name)}`,
    `  status     ${d.status}`,
    `  scope      ${d.scope}`,
    `  last test  ${ts(d.lastTestedAt)}`,
  ].join('\n');
}

export default defineCommand({
  meta: { name: 'show', description: 'show details for a backend' },
  args: {
    slug: { type: 'positional', description: 'backend slug', required: false },
    profile: { type: 'string', description: 'profile identifier' },
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
      const slug = (args.slug as string | undefined) ?? catalog.backends[0]?.id ?? 'claude-code';
      const entry = catalog.backends.find((b) => b.id === slug);
      if (!entry) {
        process.stderr.write(`${err(`backend '${slug}' not in catalog`)}\n`);
        process.exit(1);
      }
      const status = handle.backendCredentialsRepo
        .listStatuses()
        .find((s) => s.backendId === slug);
      const detail: BackendDetail = {
        id: slug,
        name: entry.name,
        status: status?.status ?? 'not_configured',
        lastTestedAt: status?.lastTestedAt ?? null,
        scope: 'profile · aes-256-gcm',
      };
      if (args.json) {
        process.stdout.write(`${JSON.stringify(detail)}\n`);
        return;
      }
      if (!isQuiet()) console.log('');
      console.log(formatBackendDetail(detail));
      if (!isQuiet()) console.log('');
    } finally {
      handle.close();
    }
  },
});
