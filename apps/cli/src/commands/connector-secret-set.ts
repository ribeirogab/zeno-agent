import { defineCommand } from 'citty';
import { resolveProfileApiUrl } from '../lib/api-base.js';
import type { ApiClient } from '../lib/api-client.js';
import { ApiClient as ApiClientImpl } from '../lib/api-client.js';
import { runCommand } from '../lib/errors.js';
import { ok, setQuiet } from '../lib/output.js';
import { promptHidden } from '../lib/prompt.js';
import { resolveConnector, resolveProfile, resolveSecretKey } from '../lib/resolvers.js';
import { waitForCommand } from '../lib/wait-command.js';
import { applyPrefix } from './connector-install.js';

export type SecretPrompter = (label: string) => Promise<string>;

interface SecretSetArgs {
  target: string;
  key: string;
  prompter?: SecretPrompter;
}

interface ConnectorDetail {
  id: string;
  catalogId?: string | null;
}

interface CatalogSecretSpec {
  key: string;
  prefix?: string;
}

interface CatalogEntry {
  id: string;
  secrets?: CatalogSecretSpec[];
}

type SecretSetClient = Pick<ApiClient, 'get' | 'patch'>;

/**
 * Resolve the connector by slug-or-id, prompt for the new value with no echo,
 * then PATCH `/api/connectors/<id>` with `{ secrets: [{ key, value }] }`. The
 * endpoint enqueues a `connector_update` and returns 202 + correlationId; we
 * poll via `waitForCommand` until terminal.
 *
 * The `prompter` parameter is injected for testability — production wiring uses
 * `lib/prompt.ts:promptHidden`; tests pass a deterministic mock.
 */
export async function runConnectorSecretSet(
  client: SecretSetClient,
  args: SecretSetArgs,
  print: (line: string) => void,
): Promise<void> {
  const detail = await client.get<ConnectorDetail>(
    `/api/connectors/${encodeURIComponent(args.target)}`,
  );
  // Look up the catalog entry's prefix (if any) so we can prepend it before
  // submitting. Custom connectors (no catalogId) skip this step.
  let prefix: string | undefined;
  if (detail.catalogId) {
    const catalog = await client.get<CatalogEntry[]>('/api/connectors/catalog');
    const entry = catalog.find((e) => e.id === detail.catalogId);
    prefix = entry?.secrets?.find((s) => s.key === args.key)?.prefix;
  }
  const prompter = args.prompter ?? defaultNoEchoPrompter;
  const raw = (await prompter(`${args.key} (input hidden): `)).trim();
  if (raw.length === 0) {
    throw new Error(`empty value for ${args.key}; refusing to write`);
  }
  const value = applyPrefix(prefix, raw);
  const post = (await client.patch(`/api/connectors/${detail.id}`, {
    secrets: [{ key: args.key, value }],
  })) as { correlationId: string };
  print(ok(`queued · correlationId=${post.correlationId}`));
  const status = await waitForCommand(client, post.correlationId);
  if (status.status === 'success') {
    print(ok(`${args.key} updated`));
    return;
  }
  throw new Error(`secret set failed: ${status.result ?? 'unknown'}`);
}

/**
 * Default prompter: delegates to `lib/prompt.ts:promptHidden`, which uses raw
 * stdin mode so the typed value never echoes to the terminal. Exported so
 * sibling commands (e.g. `rotate`) can share the same default.
 */
export async function defaultNoEchoPrompter(label: string): Promise<string> {
  return promptHidden(label);
}

export default defineCommand({
  meta: { name: 'set', description: 'set or replace a single secret value' },
  args: {
    target: { type: 'positional', description: 'slug or id', required: false },
    key: { type: 'positional', description: 'secret key', required: false },
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
    const key = await resolveSecretKey(args.key as string | undefined, {
      listSecrets: async () => {
        const detail = await client.get<{ secrets?: { key: string }[] }>(
          `/api/connectors/${encodeURIComponent(target)}`,
        );
        return detail.secrets ?? [];
      },
    });
    await runCommand(() =>
      runConnectorSecretSet(client, { target, key }, (line) => console.log(line)),
    );
  },
});
