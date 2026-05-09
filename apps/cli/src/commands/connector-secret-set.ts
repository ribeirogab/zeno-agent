import { defineCommand } from 'citty';
import { resolveProfileApiUrl } from '../lib/api-base.js';
import type { ApiClient } from '../lib/api-client.js';
import { ApiClient as ApiClientImpl } from '../lib/api-client.js';
import { ok } from '../lib/output.js';
import { promptHidden } from '../lib/prompt.js';
import { waitForCommand } from '../lib/wait-command.js';

export type SecretPrompter = (label: string) => Promise<string>;

interface SecretSetArgs {
  target: string;
  key: string;
  prompter?: SecretPrompter;
}

interface ConnectorDetail {
  id: string;
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
  const prompter = args.prompter ?? defaultNoEchoPrompter;
  const value = (await prompter(`${args.key} (input hidden): `)).trim();
  if (value.length === 0) {
    throw new Error(`empty value for ${args.key}; refusing to write`);
  }
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
    target: { type: 'positional', description: 'slug or id', required: true },
    key: { type: 'positional', description: 'secret key', required: true },
    profile: { type: 'string', description: 'profile name', required: false },
  },
  async run({ args }) {
    const profile =
      typeof args.profile === 'string' && args.profile.length > 0 ? args.profile : 'default';
    const baseUrl = await resolveProfileApiUrl(profile);
    const client = new ApiClientImpl({ baseUrl });
    await runConnectorSecretSet(
      client,
      { target: args.target as string, key: args.key as string },
      (line) => console.log(line),
    );
  },
});
