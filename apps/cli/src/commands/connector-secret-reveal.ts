import { defineCommand } from 'citty';
import { resolveProfileApiUrl } from '../lib/api-base.js';
import type { ApiClient } from '../lib/api-client.js';
import { ApiClient as ApiClientImpl, ApiError } from '../lib/api-client.js';
import { runCommand } from '../lib/errors.js';
import { setQuiet } from '../lib/output.js';
import { resolveConnector, resolveProfile, resolveSecretKey } from '../lib/resolvers.js';

interface SecretRevealArgs {
  target: string;
  key: string;
}

interface ConnectorDetail {
  id: string;
}

interface RevealResponse {
  value: string;
}

type SecretRevealClient = Pick<ApiClient, 'get'>;

/**
 * Resolve the connector by slug-or-id, then GET
 * `/api/connectors/<id>/secrets/<key>/reveal`. The endpoint is rate-limited
 * (429 with `retryAfter`) and audit-logged on the server side. On success we
 * print the plaintext value to stdout and nothing else, so callers can pipe
 * it to clipboards or env files without trimming a banner.
 *
 * Spec 2026-05-08-connectors-cli-first-design Task 14.
 */
export async function runConnectorSecretReveal(
  client: SecretRevealClient,
  args: SecretRevealArgs,
  print: (line: string) => void,
): Promise<void> {
  const detail = await client.get<ConnectorDetail>(
    `/api/connectors/${encodeURIComponent(args.target)}`,
  );
  try {
    const result = await client.get<RevealResponse>(
      `/api/connectors/${detail.id}/secrets/${encodeURIComponent(args.key)}/reveal`,
    );
    print(result.value);
  } catch (cause) {
    if (isApiError(cause) && cause.status === 429) {
      const retryAfter = readRetryAfter(cause.body);
      const suffix = retryAfter !== null ? ` retry after ${retryAfter}s` : '';
      throw new Error(`rate-limited;${suffix}`);
    }
    throw cause;
  }
}

function isApiError(error: unknown): error is ApiError {
  if (error instanceof ApiError) return true;
  // Tests construct duck-typed errors with `status` + `body`; accept either.
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as { status: unknown }).status === 'number'
  );
}

function readRetryAfter(body: unknown): number | null {
  if (typeof body !== 'object' || body === null) return null;
  const ra = (body as { retryAfter?: unknown }).retryAfter;
  return typeof ra === 'number' ? ra : null;
}

export default defineCommand({
  meta: { name: 'reveal', description: 'reveal a single secret value (rate-limited, audited)' },
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
    await runCommand(
      () => runConnectorSecretReveal(client, { target, key }, (line) => console.log(line)),
      { context: 'reveal' },
    );
  },
});
