import { defineCommand } from 'citty';
import { resolveProfileApiUrl } from '../lib/api-base.js';
import { ApiClient } from '../lib/api-client.js';
import { c } from '../lib/output.js';
import { resolveProfile } from '../lib/resolvers.js';

interface ListItem {
  kind: 'connector' | 'connector_group' | 'app';
  slug?: string;
  displayName?: string;
  instanceLabel?: string | null;
  status?: 'enabled' | 'disabled' | 'pending';
  catalogId?: string;
  name?: string;
  installationCount?: number;
  installations?: Array<{
    slug: string;
    instanceLabel?: string | null;
    status: string;
    lastVerifiedAt?: string | null;
  }>;
}

export async function runConnectorList(
  client: Pick<ApiClient, 'get'>,
  opts: { profile: string; json: boolean },
  print: (line: string) => void,
): Promise<void> {
  const items = await client.get<ListItem[]>('/api/connectors');
  if (opts.json) {
    print(JSON.stringify(items, null, 2));
    return;
  }
  for (const item of items) {
    if (item.kind === 'connector') {
      const slug = (item.slug ?? '').padEnd(28);
      const status = (item.status ?? '').padEnd(8);
      print(`${slug}  ${status}  ${item.instanceLabel ?? ''}`);
    } else if (item.kind === 'connector_group') {
      const catalog = item.catalogId ?? item.name ?? '';
      print(`${c.gold(catalog)}  (${item.installationCount ?? 0} installations)`);
      for (const inst of item.installations ?? []) {
        const slug = inst.slug.padEnd(26);
        const status = inst.status.padEnd(8);
        print(`  ${slug}  ${status}  ${inst.instanceLabel ?? ''}`);
      }
    } else if (item.kind === 'app') {
      const catalog = `app:${item.catalogId ?? ''}`;
      print(`${c.gold(catalog)} (${item.installationCount ?? 0} installations)`);
      for (const inst of item.installations ?? []) {
        const slug = inst.slug.padEnd(26);
        const status = inst.status.padEnd(8);
        print(`  ${slug}  ${status}`);
      }
    }
  }
}

export default defineCommand({
  meta: { name: 'list', description: 'list installed connectors' },
  args: {
    profile: { type: 'string', description: 'profile name', required: false },
    json: { type: 'boolean', description: 'emit raw JSON', default: false },
  },
  async run({ args }) {
    const { name: profile } = await resolveProfile(args.profile as string | undefined);
    const baseUrl = await resolveProfileApiUrl(profile);
    const client = new ApiClient({ baseUrl });
    await runConnectorList(client, { profile, json: !!args.json }, (line) => console.log(line));
  },
});
