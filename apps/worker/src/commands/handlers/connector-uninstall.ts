import type { ConnectorRepo } from '@zeno/db/runtime';
import { createLogger } from '@zeno/logger';
import { z } from 'zod';
import type { Handler } from '@/commands/dispatcher';
import type { HandlerDeps } from '@/commands/handlers';
import { GITHUB_APP_RESERVED_KEYS } from '@/github/app-auth';

const logger = createLogger({ service: 'worker' });

const payloadSchema = z.object({ id: z.string() });

type Deps = Pick<HandlerDeps, 'connectors' | 'getGithubApp'>;

export function buildConnectorUninstallHandler(deps: Deps): Handler;
export function buildConnectorUninstallHandler(connectors: ConnectorRepo): Handler;
export function buildConnectorUninstallHandler(arg: Deps | ConnectorRepo): Handler {
  const deps: Deps =
    'connectors' in (arg as Deps)
      ? (arg as Deps)
      : { connectors: arg as ConnectorRepo, getGithubApp: () => null };
  return async (cmd) => {
    const parsed = payloadSchema.safeParse(cmd.payload ? JSON.parse(cmd.payload) : null);
    if (!parsed.success) return { ok: false, error: `invalid payload: ${parsed.error.message}` };

    // Read connector + secrets BEFORE the delete so we can call
    // removeInstallation with the right name. Spec 0044.
    const before = deps.connectors.get(parsed.data.id);
    let installationName: string | null = null;
    if (before?.slug.startsWith('github-app-')) {
      const secrets = deps.connectors.getSecrets(parsed.data.id);
      installationName =
        secrets.find((s) => s.key === GITHUB_APP_RESERVED_KEYS.INSTALLATION_NAME)?.value ?? null;
    }

    const removed = deps.connectors.delete(parsed.data.id);
    if (!removed) return { ok: false, error: 'connector_not_found' };

    if (installationName) {
      const githubApp = deps.getGithubApp();
      if (githubApp) {
        githubApp.removeInstallation(installationName);
      } else {
        logger.warn(
          { event: 'connector_uninstall_no_github_app', name: installationName },
          'connector_uninstall for github-app-* but GitHubAppAuth singleton is null',
        );
      }
    }

    // Spec 0050: the auto-rule cascade that lived here (spec 0047) is gone
    // with the rest of the approval-rules infrastructure.

    return { ok: true };
  };
}
