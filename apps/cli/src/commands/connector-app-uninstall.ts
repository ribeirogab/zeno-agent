import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { defineCommand } from 'citty';
import { resolveProfileApiUrl } from '../lib/api-base.js';
import type { ApiClient } from '../lib/api-client.js';
import { ApiClient as ApiClientImpl } from '../lib/api-client.js';
import { ok } from '../lib/output.js';
import { resolveProfile } from '../lib/resolvers.js';
import { waitForCommand } from '../lib/wait-command.js';

export type AppNamePrompter = (label: string) => Promise<string>;

interface AppUninstallArgs {
  confirm?: string;
  prompter?: AppNamePrompter;
}

interface UninstallResponse {
  correlationId: string;
}

type UninstallClient = Pick<ApiClient, 'get' | 'post'>;

/**
 * Tear down the installed github-app App and cascade-delete its installation
 * connector rows. Operator must type the App name (case-sensitive) to
 * confirm — either via --confirm "<name>" or interactively when the flag is
 * absent. POSTs /catalog/github-app/uninstall-app with { confirmAppName }
 * which enqueues an `app_uninstall` command (202 + correlationId); this
 * driver polls the command until terminal.
 *
 * Spec 2026-05-08-connectors-cli-first-design Task 15.
 */
export async function runConnectorAppUninstall(
  client: UninstallClient,
  args: AppUninstallArgs,
  print: (line: string) => void,
): Promise<void> {
  const prompter = args.prompter ?? defaultAppNamePrompter;
  const provided =
    typeof args.confirm === 'string' && args.confirm.length > 0
      ? args.confirm
      : (await prompter('Type the App name to confirm: ')).trim();
  if (provided.length === 0) {
    throw new Error('empty App name; refusing to uninstall');
  }
  const post = (await client.post('/api/connectors/catalog/github-app/uninstall-app', {
    confirmAppName: provided,
  })) as UninstallResponse;
  print(ok(`queued uninstall · correlationId=${post.correlationId}`));
  const status = await waitForCommand(client, post.correlationId);
  if (status.status === 'success') {
    print(ok('app uninstalled'));
    return;
  }
  throw new Error(`app uninstall failed: ${status.result ?? 'unknown'}`);
}

async function defaultAppNamePrompter(label: string): Promise<string> {
  const rl = createInterface({ input, output });
  try {
    return await rl.question(label);
  } finally {
    rl.close();
  }
}

export default defineCommand({
  meta: {
    name: 'uninstall',
    description: 'tear down the installed github-app App (cascades to instances)',
  },
  args: {
    confirm: {
      type: 'string',
      description: 'App name to confirm (case-sensitive)',
      required: false,
    },
    profile: { type: 'string', description: 'profile name', required: false },
  },
  async run({ args }) {
    const { name: profile } = await resolveProfile(args.profile as string | undefined);
    const baseUrl = await resolveProfileApiUrl(profile);
    const client = new ApiClientImpl({ baseUrl });
    const runArgs: AppUninstallArgs = {};
    if (typeof args.confirm === 'string' && args.confirm.length > 0) {
      runArgs.confirm = args.confirm;
    }
    await runConnectorAppUninstall(client, runArgs, (line) => console.log(line));
  },
});
