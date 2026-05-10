import { defineCommand } from 'citty';
import { resolveProfileApiUrl } from '../lib/api-base.js';
import type { ApiClient } from '../lib/api-client.js';
import { ApiClient as ApiClientImpl } from '../lib/api-client.js';
import { runCommand } from '../lib/errors.js';
import { c, ok, setQuiet } from '../lib/output.js';
import { resolveProfile } from '../lib/resolvers.js';
import { waitForCommand } from '../lib/wait-command.js';

interface AddInstanceArgs {
  instanceId: string;
  label: string;
}

interface AddResponse {
  correlationId: string;
  slug: string;
}

interface CatalogEntry {
  id: string;
  terminology?: { instance?: string };
}

type AddClient = Pick<ApiClient, 'get' | 'post'>;

/**
 * Wire a discovered app-pattern instance as a connector row. POSTs
 * /catalog/github-app/installations with { installationId, displayName }
 * (the operator-supplied --label is sent as displayName, the bare
 * --instance-id is sent as installationId — the endpoint name is kept for
 * backward compatibility with the existing API). Enqueues a
 * `connector_create` command and returns 202 + { correlationId, slug };
 * this driver polls the command until terminal.
 *
 * Spec 2026-05-08-connectors-cli-first-design Task 15.
 * Spec 2026-05-09-cli-ux-overhaul iter2 Change 13 — renamed to `instances add`,
 * `--installationId` → `--instance-id`, uses catalog terminology in the
 * confirmation message.
 */
export async function runConnectorAppInstancesAdd(
  client: AddClient,
  args: AddInstanceArgs,
  print: (line: string) => void,
): Promise<void> {
  const post = (await client.post('/api/connectors/catalog/github-app/installations', {
    installationId: args.instanceId,
    displayName: args.label,
  })) as AddResponse;
  print(ok(`queued · correlationId=${post.correlationId}`));
  const status = await waitForCommand(client, post.correlationId);
  if (status.status !== 'success') {
    throw new Error(`installation add failed: ${status.result ?? 'unknown'}`);
  }
  // Catalog terminology lookup, best-effort.
  let instanceLabel = 'instance';
  try {
    const catalog = await client.get<CatalogEntry[]>('/api/connectors/catalog');
    const entry = catalog.find((e) => e.id === 'github-app');
    if (entry?.terminology?.instance) instanceLabel = entry.terminology.instance.toLowerCase();
  } catch {
    /* keep the fallback */
  }
  print(ok(`${instanceLabel} added: ${c.bold(post.slug)}`));
}

// Backwards-compatible alias for the renamed function (some tests import this).
export const runConnectorAppInstallationsAdd = runConnectorAppInstancesAdd;

export default defineCommand({
  meta: {
    name: 'add',
    description: 'wire a discovered app-pattern instance as a connector',
  },
  args: {
    'instance-id': {
      type: 'string',
      description: 'instance id (e.g. github-app installation id; from `discover`)',
      required: true,
    },
    label: {
      type: 'string',
      description: 'human-readable label (used to derive the connector slug)',
      required: true,
    },
    profile: { type: 'string', description: 'profile name', required: false },
    quiet: { type: 'boolean', description: 'minimal output' },
  },
  async run({ args }) {
    if (args.quiet) setQuiet(true);
    const { name: profile } = await resolveProfile(args.profile as string | undefined);
    const baseUrl = await resolveProfileApiUrl(profile);
    const client = new ApiClientImpl({ baseUrl });
    // citty exposes kebab-flag args under both kebab and camelCase keys.
    const flags = args as Record<string, unknown>;
    const instanceId = String(flags['instance-id'] ?? flags.instanceId ?? '');
    if (!instanceId) {
      throw new Error('--instance-id is required');
    }
    await runCommand(() =>
      runConnectorAppInstancesAdd(
        client,
        {
          instanceId,
          label: args.label as string,
        },
        (line) => console.log(line),
      ),
    );
  },
});
