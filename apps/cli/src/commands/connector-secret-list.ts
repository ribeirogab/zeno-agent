import { defineCommand } from 'citty';
import { resolveProfileApiUrl } from '../lib/api-base.js';
import type { ApiClient } from '../lib/api-client.js';
import { ApiClient as ApiClientImpl } from '../lib/api-client.js';
import { c } from '../lib/output.js';

interface SecretListArgs {
  target: string;
}

interface MaskedSecret {
  key: string;
  masked: boolean;
  last4: string;
}

interface ConnectorDetailWithSecrets {
  id: string;
  secrets: MaskedSecret[];
}

type SecretListClient = Pick<ApiClient, 'get' | 'patch'>;

/**
 * GET /api/connectors/<target> and print one masked line per secret:
 * `<key>  ●●●●●● <last4>`. The API never returns plaintext from this endpoint
 * — values are masked at the repo layer.
 *
 * Spec 2026-05-08-connectors-cli-first-design Task 14.
 */
export async function runConnectorSecretList(
  client: SecretListClient,
  args: SecretListArgs,
  print: (line: string) => void,
): Promise<void> {
  const detail = await client.get<ConnectorDetailWithSecrets>(
    `/api/connectors/${encodeURIComponent(args.target)}`,
  );
  const secrets = detail.secrets ?? [];
  for (const s of secrets) {
    print(`${s.key.padEnd(28)}  ${c.gray('●●●●●●')} ${s.last4}`);
  }
}

export default defineCommand({
  meta: { name: 'list', description: 'list secrets for a connector (always masked)' },
  args: {
    target: { type: 'positional', description: 'slug or id', required: true },
    profile: { type: 'string', description: 'profile name', required: false },
  },
  async run({ args }) {
    const profile =
      typeof args.profile === 'string' && args.profile.length > 0 ? args.profile : 'default';
    const baseUrl = await resolveProfileApiUrl(profile);
    const client = new ApiClientImpl({ baseUrl });
    await runConnectorSecretList(client, { target: args.target as string }, (line) =>
      console.log(line),
    );
  },
});
