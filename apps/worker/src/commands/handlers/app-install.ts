/**
 * `app_install` command handler. Spec 0044.
 *
 * Wakes up after the API has SYNCHRONOUSLY written a new row to
 * `connector_apps` (the API endpoint validates {appId, pem} against the
 * GitHub /app endpoint, then writes the row in one transaction). The handler
 * boots the `GitHubAppAuth` singleton if it isn't running yet so subsequent
 * `connector_create` commands for `github-app-*` slugs can register their
 * installations against it.
 *
 * Idempotent: if the singleton already exists, no-op (spec 0051 retired the
 * separate rotate-PEM flow — credential changes go through uninstall +
 * reinstall, which itself triggers `app_install` again).
 */

import { createLogger } from '@zeno/logger';
import { z } from 'zod';
import type { Handler } from '@/commands/dispatcher';
import type { HandlerDeps } from '@/commands/handlers';

const logger = createLogger({ service: 'worker' });

const payloadSchema = z.object({
  appUuid: z.string(),
});

type Deps = Pick<HandlerDeps, 'getGithubApp' | 'bootstrapGithubApp'>;

export function buildAppInstallHandler(deps: Deps): Handler {
  return async (cmd) => {
    const parsed = payloadSchema.safeParse(cmd.payload ? JSON.parse(cmd.payload) : null);
    if (!parsed.success) return { ok: false, error: `invalid payload: ${parsed.error.message}` };

    const existing = deps.getGithubApp();
    if (existing) {
      logger.info(
        { event: 'app_install_already_loaded', appUuid: parsed.data.appUuid },
        'GitHubAppAuth singleton already exists; no bootstrap needed',
      );
      return { ok: true, data: { bootstrapped: false } };
    }

    try {
      const auth = await deps.bootstrapGithubApp();
      if (!auth) {
        return {
          ok: false,
          error: 'failed to bootstrap GitHubAppAuth: no connector_apps row found',
        };
      }
      logger.info(
        { event: 'app_install_bootstrapped', appUuid: parsed.data.appUuid, appId: auth.getAppId() },
        'GitHubAppAuth singleton booted from app_install command',
      );
      return { ok: true, data: { bootstrapped: true } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `bootstrap failed: ${message}` };
    }
  };
}
