import { defineCommand } from 'citty';
import { resolveProfileApiUrl } from '../lib/api-base.js';
import type { ApiClient } from '../lib/api-client.js';
import { ApiClient as ApiClientImpl } from '../lib/api-client.js';
import { runCommand } from '../lib/errors.js';
import { ok } from '../lib/output.js';
import { resolveConnector, resolveProfile } from '../lib/resolvers.js';
import { waitForCommand } from '../lib/wait-command.js';
import { defaultNoEchoPrompter, type SecretPrompter } from './connector-secret-set.js';

interface SecretRotateArgs {
  target: string;
  prompter?: SecretPrompter;
}

interface ConnectorDetail {
  id: string;
  catalogId: string | null;
}

interface CatalogSecretSpec {
  key: string;
  required?: boolean;
  label?: string;
  help?: string;
}

interface CatalogEntry {
  id: string;
  secrets?: CatalogSecretSpec[];
}

type SecretRotateClient = Pick<ApiClient, 'get' | 'patch'>;

/**
 * Look up the connector and its catalog entry, then walk every required secret
 * the catalog declares, prompting (with no echo) for each new value. PATCH all
 * rotated secrets in a single payload — the `connector_update` handler will
 * re-discover tools once, not per-key. Custom connectors (catalogId === null)
 * are refused: there is no canonical list of required keys for rotation.
 *
 * Spec 2026-05-08-connectors-cli-first-design Task 14.
 */
export async function runConnectorSecretRotate(
  client: SecretRotateClient,
  args: SecretRotateArgs,
  print: (line: string) => void,
): Promise<void> {
  const detail = await client.get<ConnectorDetail>(
    `/api/connectors/${encodeURIComponent(args.target)}`,
  );
  if (!detail.catalogId) {
    throw new Error('rotate not supported for custom connectors; use `secret set` per key');
  }
  const catalog = await client.get<CatalogEntry[]>('/api/connectors/catalog');
  const entry = catalog.find((e) => e.id === detail.catalogId);
  if (!entry) {
    throw new Error(`catalog entry "${detail.catalogId}" not found`);
  }
  const required = (entry.secrets ?? []).filter((s) => s.required === true);
  if (required.length === 0) {
    throw new Error(`no required secrets to rotate for "${detail.catalogId}"`);
  }

  const prompter = args.prompter ?? defaultNoEchoPrompter;
  const submitted: Array<{ key: string; value: string }> = [];
  for (const spec of required) {
    const label = `${spec.label ?? spec.key} (input hidden): `;
    const value = (await prompter(label)).trim();
    if (value.length === 0) {
      throw new Error(`empty value for ${spec.key}; refusing to rotate`);
    }
    submitted.push({ key: spec.key, value });
  }

  const post = (await client.patch(`/api/connectors/${detail.id}`, {
    secrets: submitted,
  })) as { correlationId: string };
  print(ok(`queued · correlationId=${post.correlationId}`));
  const status = await waitForCommand(client, post.correlationId);
  if (status.status === 'success') {
    print(ok(`rotated ${submitted.length} secrets for ${args.target}`));
    return;
  }
  throw new Error(`secret rotate failed: ${status.result ?? 'unknown'}`);
}

export default defineCommand({
  meta: { name: 'rotate', description: 'rotate all required secrets in one round-trip' },
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
    await runCommand(() =>
      runConnectorSecretRotate(client, { target }, (line) => console.log(line)),
    );
  },
});
