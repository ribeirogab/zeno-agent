import { defineCommand } from 'citty';
import { resolveProfileApiUrl } from '../lib/api-base.js';
import type { ApiClient } from '../lib/api-client.js';
import { ApiClient as ApiClientImpl } from '../lib/api-client.js';
import { ok } from '../lib/output.js';
import { resolveConnector, resolveProfile } from '../lib/resolvers.js';
import { waitForCommand } from '../lib/wait-command.js';

interface UninstallArgs {
  target: string;
  yes: boolean;
}

interface ConnectorDetail {
  id: string;
}

type UninstallClient = Pick<ApiClient, 'get' | 'delete'>;

/**
 * Resolve the connector by slug-or-id, then DELETE /api/connectors/:id and
 * poll the resulting command until it reaches a terminal status. Refuses to
 * proceed without an explicit --yes flag because uninstall is destructive
 * (drops secrets + tools + activity history).
 *
 * Spec 2026-05-08-connectors-cli-first-design Task 11.
 */
export async function runConnectorUninstall(
  client: UninstallClient,
  args: UninstallArgs,
  print: (line: string) => void,
): Promise<void> {
  if (!args.yes) {
    throw new Error('refusing to uninstall without --yes');
  }
  const detail = await client.get<ConnectorDetail>(
    `/api/connectors/${encodeURIComponent(args.target)}`,
  );
  const post = (await client.delete(`/api/connectors/${detail.id}`)) as { correlationId: string };
  print(ok(`queued uninstall · correlationId=${post.correlationId}`));
  const status = await waitForCommand(client, post.correlationId);
  if (status.status === 'success') {
    print(ok('uninstalled'));
    return;
  }
  throw new Error(`uninstall failed: ${status.result ?? 'unknown'}`);
}

export default defineCommand({
  meta: { name: 'uninstall', description: 'uninstall a connector (requires --yes)' },
  args: {
    target: { type: 'positional', description: 'slug or id', required: false },
    profile: { type: 'string', description: 'profile name', required: false },
    yes: {
      type: 'boolean',
      alias: 'y',
      description: 'confirm destructive uninstall',
      default: false,
    },
  },
  async run({ args }) {
    const { name: profile } = await resolveProfile(args.profile as string | undefined);
    const baseUrl = await resolveProfileApiUrl(profile);
    const client = new ApiClientImpl({ baseUrl });
    const target = await resolveConnector(args.target as string | undefined, {
      listConnectors: () => client.get('/api/connectors'),
    });
    await runConnectorUninstall(client, { target, yes: !!args.yes }, (line) => console.log(line));
  },
});
