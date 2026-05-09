import { defineCommand } from 'citty';
import { resolveProfileApiUrl } from '../lib/api-base.js';
import type { ApiClient } from '../lib/api-client.js';
import { ApiClient as ApiClientImpl } from '../lib/api-client.js';
import { resolveConnector, resolveProfile } from '../lib/resolvers.js';

interface ToolListArgs {
  target: string;
}

interface ConnectorDetailWithTools {
  id: string;
  tools: Array<{
    toolName: string;
    category: string;
    permission: string;
  }>;
}

type ToolListClient = Pick<ApiClient, 'get' | 'patch'>;

/**
 * GET /api/connectors/<target> and print one line per tool:
 * `<toolName>  <category>  <permission>` (padded for alignment).
 *
 * Spec 2026-05-08-connectors-cli-first-design Task 13.
 */
export async function runConnectorToolList(
  client: ToolListClient,
  args: ToolListArgs,
  print: (line: string) => void,
): Promise<void> {
  const detail = await client.get<ConnectorDetailWithTools>(
    `/api/connectors/${encodeURIComponent(args.target)}`,
  );
  for (const t of detail.tools) {
    print(`${t.toolName.padEnd(30)}  ${t.category.padEnd(12)}  ${t.permission}`);
  }
}

export default defineCommand({
  meta: { name: 'list', description: 'list tools and their permissions for a connector' },
  args: {
    target: { type: 'positional', description: 'slug or id', required: false },
    profile: { type: 'string', description: 'profile name', required: false },
  },
  async run({ args }) {
    const { name: profile } = await resolveProfile(args.profile as string | undefined);
    const baseUrl = await resolveProfileApiUrl(profile);
    const client = new ApiClientImpl({ baseUrl });
    const target = await resolveConnector(args.target as string | undefined, {
      listConnectors: () => client.get('/api/connectors'),
    });
    await runConnectorToolList(client, { target }, (line) => console.log(line));
  },
});
