import { defineCommand } from 'citty';
import { resolveProfileApiUrl } from '../lib/api-base.js';
import type { ApiClient } from '../lib/api-client.js';
import { ApiClient as ApiClientImpl } from '../lib/api-client.js';
import { resolveProfile } from '../lib/resolvers.js';

interface DiscoveredInstallation {
  id: string;
  name: string;
  accountType: string;
  repoCount: number;
  permissions?: Record<string, string>;
  alreadyWired: boolean;
}

interface DiscoverResponse {
  installations: DiscoveredInstallation[];
}

type DiscoverClient = Pick<ApiClient, 'post'>;

/**
 * List GitHub App installations the installed App has access to. Synchronous
 * read endpoint — POST with an empty body, returns the installation set with
 * an `alreadyWired` flag indicating whether the operator has already added
 * a connector row for that installation. No command polling.
 *
 * Spec 2026-05-08-connectors-cli-first-design Task 15.
 */
export async function runConnectorAppInstallationsDiscover(
  client: DiscoverClient,
  // biome-ignore lint/correctness/noUnusedVariables: kept for future flags (e.g. --json)
  _args: Record<string, never>,
  print: (line: string) => void,
): Promise<void> {
  const result = (await client.post(
    '/api/connectors/catalog/github-app/installations/discover',
    {},
  )) as DiscoverResponse;
  for (const i of result.installations) {
    const id = i.id.padEnd(10);
    const name = i.name.padEnd(28);
    const kind = i.accountType.padEnd(14);
    const repos = `${i.repoCount} repos`.padEnd(10);
    const wiredLabel = i.alreadyWired ? '[wired]' : '[available]';
    print(`${id}  ${name}  ${kind}  ${repos}  ${wiredLabel}`);
  }
}

export default defineCommand({
  meta: {
    name: 'discover',
    description: 'list GitHub App installations visible to the installed App',
  },
  args: {
    profile: { type: 'string', description: 'profile name', required: false },
  },
  async run({ args }) {
    const { name: profile } = await resolveProfile(args.profile as string | undefined);
    const baseUrl = await resolveProfileApiUrl(profile);
    const client = new ApiClientImpl({ baseUrl });
    await runConnectorAppInstallationsDiscover(client, {}, (line) => console.log(line));
  },
});
