import { defineCommand } from 'citty';
import { resolveProfileApiUrl } from '../lib/api-base.js';
import type { ApiClient } from '../lib/api-client.js';
import { ApiClient as ApiClientImpl } from '../lib/api-client.js';
import { ok } from '../lib/output.js';
import { resolveConnector, resolveProfile } from '../lib/resolvers.js';

interface DisableArgs {
  target: string;
}

interface ConnectorDetail {
  id: string;
  status: 'enabled' | 'disabled' | 'pending';
}

type DisableClient = Pick<ApiClient, 'get' | 'patch'>;

/**
 * Resolve the connector by slug-or-id, then PATCH /:id/toggle if it is not
 * already disabled. The toggle endpoint is a direct write (200), so no command
 * polling is required.
 *
 * Spec 2026-05-08-connectors-cli-first-design Task 11.
 */
export async function runConnectorDisable(
  client: DisableClient,
  args: DisableArgs,
  print: (line: string) => void,
): Promise<void> {
  const detail = await client.get<ConnectorDetail>(
    `/api/connectors/${encodeURIComponent(args.target)}`,
  );
  if (detail.status === 'disabled') {
    print(ok(`${args.target} already disabled`));
    return;
  }
  await client.patch(`/api/connectors/${detail.id}/toggle`);
  print(ok(`${args.target} disabled`));
}

export default defineCommand({
  meta: { name: 'disable', description: 'disable a connector' },
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
    await runConnectorDisable(client, { target }, (line) => console.log(line));
  },
});
