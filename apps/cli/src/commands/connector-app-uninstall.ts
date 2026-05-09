import { defineCommand } from 'citty';
import { resolveProfileApiUrl } from '../lib/api-base.js';
import type { ApiClient } from '../lib/api-client.js';
import { ApiClient as ApiClientImpl } from '../lib/api-client.js';
import { runCommand } from '../lib/errors.js';
import { c, ok } from '../lib/output.js';
import { confirmDestructive } from '../lib/prompt.js';
import { resolveProfile } from '../lib/resolvers.js';
import { waitForCommand } from '../lib/wait-command.js';

interface UninstallResponse {
  correlationId: string;
}

type UninstallClient = Pick<ApiClient, 'get' | 'post'>;

/**
 * Tear down the installed github-app App and cascade-delete its installation
 * connector rows. POSTs /catalog/github-app/uninstall-app (empty body) which
 * enqueues an `app_uninstall` command (202 + correlationId); this driver
 * polls the command until terminal.
 *
 * The destructive confirmation is now handled at the `defineCommand.run`
 * layer via `confirmDestructive` (consistent with profile-delete and
 * connector-uninstall). The previous case-sensitive App-name gesture was
 * dropped — the API no longer enforces `confirmAppName`.
 *
 * Spec 2026-05-08-connectors-cli-first-design Task 15.
 * Spec 2026-05-09-cli-ux-overhaul Task 25 (E2).
 */
export async function runConnectorAppUninstall(
  client: UninstallClient,
  print: (line: string) => void,
): Promise<void> {
  const post = (await client.post(
    '/api/connectors/catalog/github-app/uninstall-app',
    {},
  )) as UninstallResponse;
  print(ok(`queued uninstall · correlationId=${post.correlationId}`));
  const status = await waitForCommand(client, post.correlationId);
  if (status.status === 'success') {
    print(ok('app uninstalled'));
    return;
  }
  throw new Error(`app uninstall failed: ${status.result ?? 'unknown'}`);
}

interface AppDetail {
  appName: string;
}

interface ConnectorListAppItem {
  kind: 'app';
  catalogId: string;
  installationCount?: number;
}

interface ConnectorListItem {
  kind: 'connector' | 'connector_group' | 'app';
  catalogId?: string;
  installationCount?: number;
}

export default defineCommand({
  meta: {
    name: 'uninstall',
    description: 'tear down the installed github-app App (cascades to instances)',
  },
  args: {
    profile: { type: 'string', description: 'profile name', required: false },
    yes: { type: 'boolean', description: 'skip confirmation' },
  },
  async run({ args }) {
    const { name: profile } = await resolveProfile(args.profile as string | undefined);
    const baseUrl = await resolveProfileApiUrl(profile);
    const client = new ApiClientImpl({ baseUrl });

    const app = await client.get<AppDetail>('/api/connectors/catalog/github-app/app');
    const list = await client.get<ConnectorListItem[]>('/api/connectors');
    const appItem = list.find(
      (item): item is ConnectorListAppItem =>
        item.kind === 'app' && item.catalogId === 'github-app',
    );
    const installationsCount = appItem?.installationCount ?? 0;

    const confirmed = await confirmDestructive(
      `uninstall app '${app.appName}'? this cascades to ${installationsCount} installations. (y/N)`,
      { yes: !!args.yes },
    );
    if (!confirmed) {
      console.log(c.gray('aborted.'));
      return;
    }

    await runCommand(() => runConnectorAppUninstall(client, (line) => console.log(line)));
  },
});
