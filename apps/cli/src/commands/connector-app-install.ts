import { readFileSync } from 'node:fs';
import { defineCommand } from 'citty';
import { resolveProfileApiUrl } from '../lib/api-base.js';
import type { ApiClient } from '../lib/api-client.js';
import { ApiClient as ApiClientImpl } from '../lib/api-client.js';
import { ok } from '../lib/output.js';

export type PemReader = (path: string) => string;

interface AppInstallArgs {
  catalog: string;
  appId: string;
  pemFile: string;
  readPem?: PemReader;
}

interface InstallSuccess {
  ok: true;
  appUuid: string;
  appId: string;
  appName: string;
  appSlug: string;
}

interface InstallFailure {
  ok: false;
  errorKind?: string;
  error?: string;
}

type InstallResponse = InstallSuccess | InstallFailure;

type AppInstallClient = Pick<ApiClient, 'post'>;

/**
 * Install a github-app App pattern entry. The endpoint is synchronous: it
 * validates the PEM signs a JWT for the supplied appId, fetches the App
 * metadata from GitHub, persists the connector_app row, and returns
 * { ok: true, appUuid, appId, appName, appSlug }. On any validation
 * failure (auth, conflict, rate limit) the body is { ok: false, errorKind,
 * error }. There is no command queue / correlationId for this step — only
 * the subsequent installations add operation goes through the worker.
 *
 * Spec 2026-05-08-connectors-cli-first-design Task 15.
 */
export async function runConnectorAppInstall(
  client: AppInstallClient,
  args: AppInstallArgs,
  print: (line: string) => void,
): Promise<void> {
  if (args.catalog !== 'github-app') {
    throw new Error(
      `unsupported catalog "${args.catalog}"; only github-app is supported in this version`,
    );
  }
  const reader: PemReader = args.readPem ?? ((p) => readFileSync(p, 'utf8'));
  const pem = reader(args.pemFile);
  const result = (await client.post('/api/connectors/catalog/github-app/install', {
    appId: args.appId,
    pem,
  })) as InstallResponse;
  if (result.ok !== true) {
    const kind = result.errorKind ?? 'unknown';
    const message = result.error ?? 'unknown';
    throw new Error(`app install failed: ${kind}: ${message}`);
  }
  print(ok(`app installed: ${result.appName} (${result.appSlug})`));
}

export default defineCommand({
  meta: { name: 'install', description: 'install a github-app App entry' },
  args: {
    catalog: {
      type: 'string',
      description: 'app catalog id (only "github-app" is supported)',
      required: true,
    },
    appId: {
      type: 'string',
      description: 'GitHub App numeric id',
      required: true,
    },
    pemFile: {
      type: 'string',
      description: 'path to the App private key PEM file',
      required: true,
    },
    profile: {
      type: 'string',
      description: 'profile name',
      required: false,
    },
  },
  async run({ args }) {
    const profile =
      typeof args.profile === 'string' && args.profile.length > 0 ? args.profile : 'default';
    const baseUrl = await resolveProfileApiUrl(profile);
    const client = new ApiClientImpl({ baseUrl });
    await runConnectorAppInstall(
      client,
      {
        catalog: args.catalog as string,
        appId: args.appId as string,
        pemFile: args.pemFile as string,
      },
      (line) => console.log(line),
    );
  },
});
