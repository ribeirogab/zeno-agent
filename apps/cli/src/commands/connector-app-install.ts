import { readFileSync } from 'node:fs';
import { defineCommand } from 'citty';
import { resolveProfileApiUrl } from '../lib/api-base.js';
import type { ApiClient } from '../lib/api-client.js';
import { ApiClient as ApiClientImpl } from '../lib/api-client.js';
import { runCommand } from '../lib/errors.js';
import { ok, setQuiet } from '../lib/output.js';
import { resolveProfile } from '../lib/resolvers.js';

export type PemReader = (path: string) => string;

interface AppArgSpec {
  key: string;
  label?: string;
  type: 'text' | 'file';
  required?: boolean;
}

interface AppCatalogEntry {
  id: string;
  pattern?: string;
  appArgs?: AppArgSpec[];
}

interface AppInstallArgs {
  catalog: string;
  /** Map of `appArgs` key → operator-supplied value (text) or file path (file). */
  args: Record<string, string>;
  readPem?: PemReader;
}

// Backwards-compat shape kept for the existing test suite.
interface LegacyAppInstallArgs {
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

type AppInstallClient = Pick<ApiClient, 'get' | 'post'>;

/**
 * Install the App entity for an app-pattern catalog. The catalog declares
 * which arguments the operator must supply via `appArgs`; the CLI prompts /
 * accepts each by `key`. For `type: "file"`, the value is a path that we read
 * with `readPem`. The `github-app` catalog declares `app-id` (text) and
 * `pem-file` (file) — we map those to the API's `{ appId, pem }` body.
 *
 * The endpoint is synchronous: it validates the PEM, signs a JWT for the
 * supplied appId, fetches the App metadata from GitHub, persists the
 * connector_app row, and returns { ok: true, appUuid, appId, appName,
 * appSlug }. On any validation failure (auth, conflict, rate limit) the body
 * is { ok: false, errorKind, error }. There is no command queue / correlationId
 * for this step — only the subsequent instances add operation goes through
 * the worker.
 *
 * Spec 2026-05-08-connectors-cli-first-design Task 15.
 * Spec 2026-05-09-cli-ux-overhaul iter2 Change 13 — catalog-driven via appArgs.
 */
export async function runConnectorAppInstall(
  client: AppInstallClient,
  args: AppInstallArgs | LegacyAppInstallArgs,
  print: (line: string) => void,
): Promise<void> {
  if (args.catalog !== 'github-app') {
    throw new Error(
      `unsupported catalog "${args.catalog}"; only github-app is supported in this version`,
    );
  }
  const reader: PemReader = args.readPem ?? ((p) => readFileSync(p, 'utf8'));

  // Accept either the legacy shape ({ appId, pemFile }) used by existing
  // tests, or the new catalog-driven shape ({ args: { 'app-id', 'pem-file' } }).
  const flatArgs: Record<string, string> = isLegacyShape(args)
    ? { 'app-id': args.appId, 'pem-file': args.pemFile }
    : args.args;

  const appId = flatArgs['app-id'];
  const pemPath = flatArgs['pem-file'];
  if (!appId) throw new Error('--arg app-id=<id> is required');
  if (!pemPath) throw new Error('--arg pem-file=<path> is required');

  const pem = reader(pemPath);
  const result = (await client.post('/api/connectors/catalog/github-app/install', {
    appId,
    pem,
  })) as InstallResponse;
  if (result.ok !== true) {
    const kind = result.errorKind ?? 'unknown';
    const message = result.error ?? 'unknown';
    throw new Error(`app install failed: ${kind}: ${message}`);
  }
  print(ok(`app installed: ${result.appName} (${result.appSlug})`));
}

function isLegacyShape(args: AppInstallArgs | LegacyAppInstallArgs): args is LegacyAppInstallArgs {
  return 'appId' in args && 'pemFile' in args;
}

/**
 * Parse repeatable `--arg key=value` flags. Mirrors the `--secret KEY=VALUE`
 * shape used by `connector install` so operators don't have to learn two
 * conventions for catalog-declared args.
 */
function parseArgFlags(flag: unknown): Record<string, string> {
  const flat: string[] = Array.isArray(flag)
    ? (flag.filter((v): v is string => typeof v === 'string') as string[])
    : typeof flag === 'string'
      ? [flag]
      : [];
  const out: Record<string, string> = {};
  for (const item of flat) {
    const eq = item.indexOf('=');
    if (eq < 1) {
      throw new Error(`invalid --arg "${item}", expected key=value`);
    }
    out[item.slice(0, eq)] = item.slice(eq + 1);
  }
  return out;
}

export default defineCommand({
  meta: { name: 'install', description: 'install an app-pattern catalog App entry' },
  args: {
    catalog: {
      type: 'string',
      description: 'app catalog id (only "github-app" is supported)',
      required: true,
    },
    arg: {
      type: 'string',
      valueHint: 'key=value',
      description:
        'catalog-declared App arg (repeatable; e.g. --arg app-id=12345 --arg pem-file=./key.pem)',
    },
    'app-id': {
      type: 'string',
      description: 'shorthand for --arg app-id=<id>',
    },
    'pem-file': {
      type: 'string',
      description: 'shorthand for --arg pem-file=<path>',
    },
    profile: {
      type: 'string',
      description: 'profile name',
      required: false,
    },
    quiet: { type: 'boolean', description: 'minimal output' },
  },
  async run({ args }) {
    if (args.quiet) setQuiet(true);
    const { name: profile } = await resolveProfile(args.profile as string | undefined);
    const baseUrl = await resolveProfileApiUrl(profile);
    const client = new ApiClientImpl({ baseUrl });
    const flags = args as Record<string, unknown>;

    // Build the args map: --arg key=value entries plus any individual shorthand flags.
    const argMap = parseArgFlags(args.arg);
    const appIdShort = (flags['app-id'] ?? flags.appId) as string | undefined;
    const pemFileShort = (flags['pem-file'] ?? flags.pemFile) as string | undefined;
    if (typeof appIdShort === 'string' && appIdShort.length > 0) argMap['app-id'] = appIdShort;
    if (typeof pemFileShort === 'string' && pemFileShort.length > 0) argMap['pem-file'] = pemFileShort;

    // Validate against the catalog declaration when available.
    try {
      const catalog = await client.get<AppCatalogEntry[]>('/api/connectors/catalog');
      const entry = catalog.find((e) => e.id === args.catalog);
      const expectedArgs = entry?.appArgs ?? [];
      for (const spec of expectedArgs) {
        if (spec.required !== false && !argMap[spec.key]) {
          throw new Error(
            `--arg ${spec.key}=<value> is required (declared by catalog "${args.catalog}")`,
          );
        }
      }
    } catch (e) {
      // Re-throw catalog-validation errors; ignore network errors (we still try
      // to install with whatever we have — the API will reject if needed).
      if (e instanceof Error && e.message.startsWith('--arg')) throw e;
    }

    await runCommand(() =>
      runConnectorAppInstall(
        client,
        { catalog: args.catalog as string, args: argMap },
        (line) => console.log(line),
      ),
    );
  },
});
