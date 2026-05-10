import { defineCommand } from 'citty';
import { resolveProfileApiUrl } from '../lib/api-base.js';
import type { ApiClient } from '../lib/api-client.js';
import { ApiClient as ApiClientImpl } from '../lib/api-client.js';
import { c, setQuiet } from '../lib/output.js';
import { resolveProfile } from '../lib/resolvers.js';
import type { DiscoveredInstallationJson } from '../types/json-output.js';

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

interface CatalogEntry {
  id: string;
  pattern?: string;
  terminology?: { instance?: string };
}

interface DiscoverArgs {
  json?: boolean;
}

type DiscoverClient = Pick<ApiClient, 'get' | 'post'>;

/**
 * List instances the installed App has access to. Synchronous read endpoint —
 * POST with an empty body, returns the instance set with an `alreadyWired`
 * flag indicating whether the operator has already added a connector row for
 * that instance. No command polling.
 *
 * When `args.json` is set, emits a single line of JSON containing the
 * DiscoveredInstallationJson[] payload (legacy name kept for backward
 * compatibility — the JSON shape is unchanged).
 *
 * Spec 2026-05-08-connectors-cli-first-design Task 15.
 * Spec 2026-05-09-cli-ux-overhaul Task 27 (E4) — adds --json.
 * Spec 2026-05-09-cli-ux-overhaul iter2 Change 13 — renamed to `instances`,
 * uses catalog terminology when rendering.
 */
export async function runConnectorAppInstancesDiscover(
  client: DiscoverClient,
  args: DiscoverArgs,
  print: (line: string) => void,
): Promise<void> {
  const result = (await client.post(
    '/api/connectors/catalog/github-app/installations/discover',
    {},
  )) as DiscoverResponse;
  if (args.json) {
    const rows: DiscoveredInstallationJson[] = result.installations.map((i) => {
      const row: DiscoveredInstallationJson = {
        id: i.id,
        name: i.name,
        accountType: i.accountType,
        repoCount: i.repoCount,
        alreadyWired: i.alreadyWired,
      };
      if (i.permissions) row.permissions = i.permissions;
      return row;
    });
    print(JSON.stringify(rows));
    return;
  }
  // Best-effort terminology lookup — fall back to "Instance" when the API
  // doesn't expose the field (older catalog or unrelated catalog).
  let instanceLabel = 'Instance';
  try {
    const catalog = await client.get<CatalogEntry[]>('/api/connectors/catalog');
    const entry = catalog.find((e) => e.id === 'github-app');
    if (entry?.terminology?.instance) instanceLabel = entry.terminology.instance;
  } catch {
    /* keep the fallback */
  }
  if (result.installations.length > 0) {
    print(c.gray(`${instanceLabel.toLowerCase()}s:`));
  }
  for (const i of result.installations) {
    const id = i.id.padEnd(10);
    const name = i.name.padEnd(28);
    const kind = i.accountType.padEnd(14);
    const repos = `${i.repoCount} repos`.padEnd(10);
    const wiredLabel = i.alreadyWired ? '[wired]' : '[available]';
    print(`${id}  ${name}  ${kind}  ${repos}  ${wiredLabel}`);
  }
}

// Backwards-compatible alias for the renamed function (some tests import this).
export const runConnectorAppInstallationsDiscover = runConnectorAppInstancesDiscover;

export default defineCommand({
  meta: {
    name: 'discover',
    description: 'list app-pattern catalog instances visible to the installed App',
  },
  args: {
    profile: { type: 'string', description: 'profile name', required: false },
    json: { type: 'boolean', description: 'emit JSON' },
    quiet: { type: 'boolean', description: 'minimal output' },
  },
  async run({ args }) {
    if (args.quiet) setQuiet(true);
    const { name: profile } = await resolveProfile(args.profile as string | undefined);
    const baseUrl = await resolveProfileApiUrl(profile);
    const client = new ApiClientImpl({ baseUrl });
    await runConnectorAppInstancesDiscover(client, { json: !!args.json }, (line) =>
      console.log(line),
    );
  },
});
