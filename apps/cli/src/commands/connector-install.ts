import { defineCommand } from 'citty';
import { resolveProfileApiUrl } from '../lib/api-base.js';
import type { ApiClient } from '../lib/api-client.js';
import { ApiClient as ApiClientImpl } from '../lib/api-client.js';
import { runCommand } from '../lib/errors.js';
import { c, err, info, ok, setQuiet } from '../lib/output.js';
import { promptHidden } from '../lib/prompt.js';
import { resolveCatalog, resolveProfile } from '../lib/resolvers.js';
import { waitForCommand } from '../lib/wait-command.js';

interface CatalogSecretSpec {
  key: string;
  required?: boolean;
  help?: string;
  label?: string;
  /**
   * Optional prefix prepended to the operator-supplied value at storage time.
   * The prompt drops the prefix from the displayed label so the operator types
   * only the bare token. Server stores `prefix + value` verbatim; reveal echos
   * the full stored string.
   */
  prefix?: string;
}

interface CatalogEntry {
  id: string;
  secrets?: CatalogSecretSpec[];
}

interface InstallArgs {
  catalogId: string;
  label?: string;
  secrets?: Record<string, string>;
  /**
   * When true (default), the CLI runs `connector test` against the freshly
   * installed slug and auto-uninstalls + exits 1 if the test fails. Operators
   * can opt out with `--no-verify` to keep the legacy install-and-walk-away
   * behaviour (useful when the connector intentionally has no test surface).
   */
  verify?: boolean;
}

type InstallClient = Pick<ApiClient, 'get' | 'post' | 'delete'>;

interface InstalledConnector {
  id: string;
  slug: string;
  catalogId?: string | null;
  instanceLabel?: string | null;
}

interface TestResult {
  ok: boolean;
  tools?: Array<{ name: string }>;
  durationMs?: number;
  errorKind?: string;
  error?: string;
}

/**
 * Run the install flow: look up the catalog entry, prompt for any missing
 * required secrets, POST /api/connectors, and poll the resulting command
 * until it reaches a terminal status.
 *
 * Spec 2026-05-08-connectors-cli-first-design Task 10. The API now returns
 * 202 + { correlationId } for queued mutations; this driver consumes that
 * field directly.
 */
export async function runConnectorInstall(
  client: InstallClient,
  args: InstallArgs,
  print: (line: string) => void,
): Promise<void> {
  const catalog = await client.get<CatalogEntry[]>('/api/connectors/catalog');
  const entry = catalog.find((e) => e.id === args.catalogId);
  if (!entry) {
    throw new Error(`catalog entry "${args.catalogId}" not found`);
  }

  const provided = args.secrets ?? {};
  const submitted: Array<{ key: string; value: string }> = [];
  const required = (entry.secrets ?? []).filter((s) => s.required === true);
  const specByKey = new Map((entry.secrets ?? []).map((s) => [s.key, s]));
  for (const sec of required) {
    const raw = provided[sec.key] ?? (await promptHidden(sec.label ?? sec.key, sec.help));
    submitted.push({ key: sec.key, value: applyPrefix(sec.prefix, raw) });
  }
  // Also forward any non-required secrets the operator explicitly provided.
  const requiredKeys = new Set(required.map((s) => s.key));
  for (const [key, value] of Object.entries(provided)) {
    if (!requiredKeys.has(key)) {
      const spec = specByKey.get(key);
      submitted.push({ key, value: applyPrefix(spec?.prefix, value) });
    }
  }

  // Capture the pre-install slug set so we can identify the freshly installed
  // row by exclusion afterwards. The API derives the slug server-side and
  // applies collision suffixes (-2, -3, ...); deriving it here would race.
  const verify = args.verify !== false;
  const preInstallSlugs = verify
    ? new Set((await client.get<InstalledConnector[]>('/api/connectors')).map((c2) => c2.slug))
    : null;

  const post = (await client.post('/api/connectors', {
    source: 'catalog',
    catalogId: args.catalogId,
    instanceLabel: args.label,
    secrets: submitted,
  })) as { correlationId: string };

  print(ok(`queued · correlationId=${post.correlationId}`));
  const status = await waitForCommand(client, post.correlationId);
  if (status.status !== 'success') {
    throw new Error(`install failed: ${status.result ?? 'unknown'}`);
  }
  print(ok('installed'));

  if (!verify) return;

  // Identify the new slug: the one row that wasn't there before.
  const after = await client.get<InstalledConnector[]>('/api/connectors');
  const fresh = after.find((c2) => !preInstallSlugs?.has(c2.slug));
  if (!fresh) {
    // Should not happen on a well-behaved API. Skip the verify silently rather
    // than crash post-install.
    return;
  }

  print(info('verifying...'));
  const result = (await client.post(`/api/connectors/${fresh.id}/test`, undefined)) as TestResult;
  if (result.ok) {
    const tools = result.tools ?? [];
    print(ok(`verified · ${tools.length} tools`));
    return;
  }

  // Verification failed → roll back so the operator isn't left with a broken
  // half-wired row that needs manual cleanup before retrying.
  const reason = result.error ?? result.errorKind ?? 'unknown';
  print(
    `${err(`verification failed: ${result.errorKind ?? 'unknown'}${result.error ? ` (${result.error})` : ''}`)}`,
  );
  print(c.gray('rolling back...'));
  try {
    await client.delete(`/api/connectors/${fresh.id}`);
    print(ok('uninstalled'));
  } catch (cause) {
    print(`${err(`rollback failed: ${(cause as Error).message}`)}`);
  }
  throw new Error(`install verification failed: ${reason}`);
}

/**
 * Prepend the catalog-declared prefix to the operator-supplied value at
 * storage time. Idempotent: when the value already starts with the prefix
 * (operator forgot the prompt skipped it, or the value was preprocessed),
 * we leave it alone to avoid double-prefixing.
 */
export function applyPrefix(prefix: string | undefined, value: string): string {
  if (!prefix) return value;
  if (value.startsWith(prefix)) return value;
  return prefix + value;
}

/**
 * Collect every `--secret KEY=VALUE` (and `--secret=KEY=VALUE`) pair from the
 * raw CLI args. We scan `rawArgs` instead of trusting citty's parsed
 * `args.secret` because citty@0.1.6 only retains the LAST occurrence of a
 * repeated string-typed flag (no array support) — silently dropping every
 * earlier `--secret` flag. Without this, any multi-secret connector
 * (mysql with 5 required secrets) would fail at install time because four of
 * the five values get clobbered before reaching `runConnectorInstall`. The
 * citty-parsed value is still passed in as `cittyFallback` so commands not
 * routed through this CLI (tests, programmatic callers) keep working.
 *
 * Spec 2026-05-19-connector-mysql Finding #1.
 */
export function parseSecretFlags(
  cittyFallback: unknown,
  rawArgs?: string[],
): Record<string, string> {
  const flat: string[] = [];
  if (Array.isArray(rawArgs) && rawArgs.length > 0) {
    for (let i = 0; i < rawArgs.length; i++) {
      const arg = rawArgs[i];
      if (typeof arg !== 'string') continue;
      if (arg === '--secret' || arg === '-s') {
        const next = rawArgs[i + 1];
        if (typeof next === 'string' && !next.startsWith('-')) {
          flat.push(next);
          i++;
        }
      } else if (arg.startsWith('--secret=')) {
        flat.push(arg.slice('--secret='.length));
      }
    }
  }
  if (flat.length === 0) {
    if (Array.isArray(cittyFallback)) {
      for (const v of cittyFallback) {
        if (typeof v === 'string') flat.push(v);
      }
    } else if (typeof cittyFallback === 'string') {
      flat.push(cittyFallback);
    }
  }
  const out: Record<string, string> = {};
  for (const item of flat) {
    const eq = item.indexOf('=');
    if (eq < 1) {
      throw new Error(`invalid --secret "${item}", expected KEY=VALUE`);
    }
    out[item.slice(0, eq)] = item.slice(eq + 1);
  }
  return out;
}

export default defineCommand({
  meta: { name: 'install', description: 'install a catalog connector' },
  args: {
    catalogId: {
      type: 'positional',
      description: 'catalog entry id (e.g. "linear", "sentry")',
      required: false,
    },
    label: {
      type: 'string',
      description:
        'instance label (operator-supplied; required when installing a second instance of the same catalog)',
    },
    profile: {
      type: 'string',
      description: 'profile name',
    },
    secret: {
      type: 'string',
      valueHint: 'KEY=VALUE',
      description: 'secret to set (repeatable, e.g. --secret LINEAR_API_KEY=xyz)',
    },
    'no-verify': {
      type: 'boolean',
      description: 'skip the post-install test + auto-rollback (legacy behaviour)',
    },
    quiet: { type: 'boolean', description: 'minimal output' },
  },
  async run({ args, rawArgs }) {
    if (args.quiet) setQuiet(true);
    const { name: profile } = await resolveProfile(args.profile as string | undefined);
    const baseUrl = await resolveProfileApiUrl(profile);
    const client = new ApiClientImpl({ baseUrl });
    const catalogId = await resolveCatalog(args.catalogId as string | undefined, {
      listCatalog: () => client.get('/api/connectors/catalog'),
    });
    const secrets = parseSecretFlags(args.secret, rawArgs);
    // citty exposes kebab-flag args under both kebab and camelCase keys.
    const noVerify = Boolean(
      (args as Record<string, unknown>)['no-verify'] ?? (args as Record<string, unknown>).noVerify,
    );
    const installArgs: InstallArgs = {
      catalogId,
      secrets,
      verify: !noVerify,
    };
    if (typeof args.label === 'string' && args.label.length > 0) {
      installArgs.label = args.label;
    }
    await runCommand(() => runConnectorInstall(client, installArgs, (line) => console.log(line)), {
      context: 'install',
    });
  },
});
