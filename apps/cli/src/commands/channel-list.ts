/**
 * Spec 2026-05-11 — `zeno channel list` — table of channels installed in a profile.
 *
 * Reads `GET /api/channels` (no gate). Each row reflects the live status the worker
 * writes back (lastError set when an adapter disconnects, lastVerifiedAt set after
 * a passed test/rotate).
 */

import { defineCommand } from 'citty';
import { resolveProfileApiUrl } from '../lib/api-base.js';
import { ApiClient } from '../lib/api-client.js';
import { c, isQuiet, setQuiet } from '../lib/output.js';
import { resolveProfile } from '../lib/resolvers.js';

export interface ChannelListItem {
  id: string;
  slug: string;
  displayName: string;
  catalogId: string;
  status: 'enabled' | 'disabled';
  lastError: string | null;
  lastErrorAt: string | null;
  lastVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function runChannelList(
  client: Pick<ApiClient, 'get'>,
  opts: { json: boolean },
  print: (line: string) => void,
): Promise<void> {
  const rows = await client.get<ChannelListItem[]>('/api/channels');
  if (opts.json) {
    print(JSON.stringify(rows));
    return;
  }
  if (!isQuiet()) {
    print('');
    print(`  ${c.bold('channel'.padEnd(14))} ${c.bold('status'.padEnd(14))} ${c.bold('last event')}`);
  }
  for (const row of rows) {
    const status = row.lastError ? 'disconnected' : 'connected';
    const ts = row.lastVerifiedAt ?? row.lastErrorAt ?? row.createdAt;
    print(`  ${row.slug.padEnd(14)} ${status.padEnd(14)} ${ts}`);
  }
  if (!isQuiet()) print('');
}

export default defineCommand({
  meta: { name: 'list', description: 'list installed channels' },
  args: {
    profile: { type: 'string', description: 'profile name', required: false },
    json: { type: 'boolean', description: 'emit JSON', default: false },
    quiet: { type: 'boolean', description: 'minimal output' },
  },
  async run({ args }) {
    if (args.quiet) setQuiet(true);
    const { name: profile } = await resolveProfile(args.profile as string | undefined);
    const baseUrl = await resolveProfileApiUrl(profile);
    const client = new ApiClient({ baseUrl });
    await runChannelList(client, { json: !!args.json }, (line) => console.log(line));
  },
});
