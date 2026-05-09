import { defineCommand } from 'citty';
import { resolveProfileApiUrl } from '../lib/api-base.js';
import type { ApiClient } from '../lib/api-client.js';
import { ApiClient as ApiClientImpl } from '../lib/api-client.js';
import { runCommand } from '../lib/errors.js';
import { ok, setQuiet } from '../lib/output.js';
import { resolveConnector, resolveProfile } from '../lib/resolvers.js';
import { waitForCommand } from '../lib/wait-command.js';

interface RefreshArgs {
  target: string;
}

interface ConnectorDetail {
  id: string;
}

type RefreshClient = Pick<ApiClient, 'get' | 'post'>;

/**
 * Resolve the connector by slug-or-id, then POST /api/connectors/:id/refresh-tools
 * which enqueues a `connector_refresh_tools` command and returns
 * 202 + { correlationId }. Poll until terminal status, then print outcome.
 *
 * Spec 2026-05-08-connectors-cli-first-design Task 12.
 */
export async function runConnectorRefreshTools(
  client: RefreshClient,
  args: RefreshArgs,
  print: (line: string) => void,
): Promise<void> {
  const detail = await client.get<ConnectorDetail>(
    `/api/connectors/${encodeURIComponent(args.target)}`,
  );
  const post = (await client.post(`/api/connectors/${detail.id}/refresh-tools`, undefined)) as {
    correlationId: string;
  };
  print(ok(`queued refresh-tools · correlationId=${post.correlationId}`));
  const status = await waitForCommand(client, post.correlationId);
  if (status.status === 'success') {
    print(ok('refreshed'));
    return;
  }
  throw new Error(`refresh-tools failed: ${status.result ?? 'unknown'}`);
}

export default defineCommand({
  meta: { name: 'refresh-tools', description: 're-discover tools for a connector' },
  args: {
    target: { type: 'positional', description: 'slug or id', required: false },
    profile: { type: 'string', description: 'profile name', required: false },
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
    await runCommand(() =>
      runConnectorRefreshTools(client, { target }, (line) => console.log(line)),
    );
  },
});
