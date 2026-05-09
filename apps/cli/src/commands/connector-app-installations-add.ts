import { defineCommand } from 'citty';
import { resolveProfileApiUrl } from '../lib/api-base.js';
import type { ApiClient } from '../lib/api-client.js';
import { ApiClient as ApiClientImpl } from '../lib/api-client.js';
import { ok } from '../lib/output.js';
import { resolveProfile } from '../lib/resolvers.js';
import { waitForCommand } from '../lib/wait-command.js';

interface AddInstallationArgs {
  installationId: string;
  label: string;
}

interface AddResponse {
  correlationId: string;
  slug: string;
}

type AddClient = Pick<ApiClient, 'get' | 'post'>;

/**
 * Wire a discovered GitHub App installation as a connector row. POSTs
 * /catalog/github-app/installations with { installationId, displayName }
 * (the operator-supplied --label is sent as displayName). The endpoint
 * enqueues a `connector_create` command and returns 202 + { correlationId,
 * slug }; this driver polls the command until terminal.
 *
 * Spec 2026-05-08-connectors-cli-first-design Task 15.
 */
export async function runConnectorAppInstallationsAdd(
  client: AddClient,
  args: AddInstallationArgs,
  print: (line: string) => void,
): Promise<void> {
  const post = (await client.post('/api/connectors/catalog/github-app/installations', {
    installationId: args.installationId,
    displayName: args.label,
  })) as AddResponse;
  print(ok(`queued · correlationId=${post.correlationId}`));
  const status = await waitForCommand(client, post.correlationId);
  if (status.status === 'success') {
    print(ok(`installed: ${post.slug}`));
    return;
  }
  throw new Error(`installation add failed: ${status.result ?? 'unknown'}`);
}

export default defineCommand({
  meta: {
    name: 'add',
    description: 'wire a discovered GitHub App installation as a connector',
  },
  args: {
    installationId: {
      type: 'string',
      description: 'numeric installation id (from `discover`)',
      required: true,
    },
    label: {
      type: 'string',
      description: 'human-readable label (used to derive the connector slug)',
      required: true,
    },
    profile: { type: 'string', description: 'profile name', required: false },
  },
  async run({ args }) {
    const { name: profile } = await resolveProfile(args.profile as string | undefined);
    const baseUrl = await resolveProfileApiUrl(profile);
    const client = new ApiClientImpl({ baseUrl });
    await runConnectorAppInstallationsAdd(
      client,
      {
        installationId: args.installationId as string,
        label: args.label as string,
      },
      (line) => console.log(line),
    );
  },
});
