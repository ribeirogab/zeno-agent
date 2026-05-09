import { defineCommand } from 'citty';
import { resolveProfileApiUrl } from '../lib/api-base.js';
import { ApiClient } from '../lib/api-client.js';

interface CatalogItem {
  id: string;
  name: string;
  description: string;
  isInstalled: boolean;
  toolCount: number;
}

export async function runConnectorCatalog(
  client: Pick<ApiClient, 'get'>,
  args: { json: boolean },
  print: (line: string) => void,
): Promise<void> {
  const items = await client.get<CatalogItem[]>('/api/connectors/catalog');
  if (args.json) {
    print(JSON.stringify(items, null, 2));
    return;
  }
  for (const it of items) {
    const status = it.isInstalled ? 'installed' : 'available';
    print(`${it.id.padEnd(16)}  ${status.padEnd(10)}  ${it.name}`);
  }
}

export default defineCommand({
  meta: { name: 'catalog', description: 'list catalog entries' },
  args: {
    profile: { type: 'string', description: 'profile name', required: false },
    json: { type: 'boolean', description: 'emit raw JSON', default: false },
  },
  async run({ args }) {
    const profile = args.profile ?? 'default';
    const baseUrl = await resolveProfileApiUrl(profile);
    const client = new ApiClient({ baseUrl });
    await runConnectorCatalog(client, { json: !!args.json }, (line) => console.log(line));
  },
});
