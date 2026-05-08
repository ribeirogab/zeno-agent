import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { defineCommand } from 'citty';
import { resolveProfileApiUrl } from '../lib/api-base.js';
import type { ApiClient } from '../lib/api-client.js';
import { ApiClient as ApiClientImpl } from '../lib/api-client.js';
import { c, ok } from '../lib/output.js';
import { waitForCommand } from '../lib/wait-command.js';

interface CatalogSecretSpec {
  key: string;
  required?: boolean;
  help?: string;
  label?: string;
}

interface CatalogEntry {
  id: string;
  secrets?: CatalogSecretSpec[];
}

interface InstallArgs {
  catalogId: string;
  label?: string;
  secrets?: Record<string, string>;
}

type InstallClient = Pick<ApiClient, 'get' | 'post'>;

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
  for (const sec of required) {
    const value = provided[sec.key] ?? (await promptSecret(sec.label ?? sec.key, sec.help));
    submitted.push({ key: sec.key, value });
  }
  // Also forward any non-required secrets the operator explicitly provided.
  const requiredKeys = new Set(required.map((s) => s.key));
  for (const [key, value] of Object.entries(provided)) {
    if (!requiredKeys.has(key)) {
      submitted.push({ key, value });
    }
  }

  const post = (await client.post('/api/connectors', {
    source: 'catalog',
    catalogId: args.catalogId,
    instanceLabel: args.label,
    secrets: submitted,
  })) as { correlationId: string };

  print(ok(`queued · correlationId=${post.correlationId}`));
  const status = await waitForCommand(client, post.correlationId);
  if (status.status === 'success') {
    print(ok('installed'));
    return;
  }
  throw new Error(`install failed: ${status.result ?? 'unknown'}`);
}

async function promptSecret(label: string, help?: string): Promise<string> {
  const rl = createInterface({ input, output });
  try {
    if (help) console.log(c.dim(help));
    const value = await rl.question(`${label}: `);
    return value.trim();
  } finally {
    rl.close();
  }
}

function parseSecretFlags(flag: unknown): Record<string, string> {
  const flat: string[] = Array.isArray(flag)
    ? (flag.filter((v): v is string => typeof v === 'string') as string[])
    : typeof flag === 'string'
      ? [flag]
      : [];
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
      required: true,
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
  },
  async run({ args }) {
    const profile =
      typeof args.profile === 'string' && args.profile.length > 0 ? args.profile : 'default';
    const baseUrl = await resolveProfileApiUrl(profile);
    const client = new ApiClientImpl({ baseUrl });
    const secrets = parseSecretFlags(args.secret);
    const installArgs: InstallArgs = {
      catalogId: args.catalogId as string,
      secrets,
    };
    if (typeof args.label === 'string' && args.label.length > 0) {
      installArgs.label = args.label;
    }
    await runConnectorInstall(client, installArgs, (line) => console.log(line));
  },
});
