import { defineCommand } from 'citty';
import { resolveProfileApiUrl } from '../lib/api-base.js';
import type { ApiClient } from '../lib/api-client.js';
import { ApiClient as ApiClientImpl } from '../lib/api-client.js';
import { setQuiet } from '../lib/output.js';
import { resolveConnector, resolveProfile } from '../lib/resolvers.js';
import type { ToolListItem } from '../types/json-output.js';

interface ToolListArgs {
  target: string;
  json?: boolean;
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
 * When `args.json` is set, emits a single line of JSON containing the
 * ToolListItem[] payload (matching the documented type in
 * apps/cli/src/types/json-output.ts).
 *
 * Spec 2026-05-08-connectors-cli-first-design Task 13.
 * Spec 2026-05-09-cli-ux-overhaul Task 27 (E4) — adds --json.
 */
export async function runConnectorToolList(
  client: ToolListClient,
  args: ToolListArgs,
  print: (line: string) => void,
): Promise<void> {
  const detail = await client.get<ConnectorDetailWithTools>(
    `/api/connectors/${encodeURIComponent(args.target)}`,
  );
  if (args.json) {
    const rows: ToolListItem[] = detail.tools.map((t) => {
      const row: ToolListItem = {
        name: t.toolName,
        permission: t.permission as ToolListItem['permission'],
      };
      if (t.category) row.category = t.category as 'read' | 'write' | 'interactive';
      return row;
    });
    print(JSON.stringify(rows));
    return;
  }
  for (const t of detail.tools) {
    print(`${t.toolName.padEnd(30)}  ${t.category.padEnd(12)}  ${t.permission}`);
  }
}

export default defineCommand({
  meta: { name: 'list', description: 'list tools and their permissions for a connector' },
  args: {
    target: { type: 'positional', description: 'slug or id', required: false },
    profile: { type: 'string', description: 'profile name', required: false },
    json: { type: 'boolean', description: 'emit JSON' },
    quiet: { type: 'boolean', description: 'minimal output' },
  },
  async run({ args }) {
    if (args.quiet) setQuiet(true);
    const { name: profile } = await resolveProfile(args.profile as string | undefined);
    const baseUrl = await resolveProfileApiUrl(profile);
    const client = new ApiClientImpl({ baseUrl });
    const target = await resolveConnector(args.target as string | undefined, {
      listConnectors: () => client.get('/api/connectors'),
    });
    await runConnectorToolList(client, { target, json: !!args.json }, (line) => console.log(line));
  },
});
