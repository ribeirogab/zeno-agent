/**
 * `app_uninstall` command handler. Spec 0044.
 *
 * The API endpoint deletes the `connector_apps` row in a transaction; the
 * `ON DELETE CASCADE` on `connectors.app_id` removes every github-app-*
 * connector and its secrets in the same transaction.
 *
 * This handler tears down the in-memory singleton: stops the refresh
 * interval, clears every cached token, unsets every env var. Idempotent
 * (no-op if the singleton is already null).
 */

import { createLogger } from '@zeno/logger';
import { z } from 'zod';
import type { Handler } from '@/commands/dispatcher';
import type { HandlerDeps } from '@/commands/handlers';

const logger = createLogger({ service: 'worker' });

const payloadSchema = z.object({
  appUuid: z.string(),
});

type Deps = Pick<HandlerDeps, 'getGithubApp' | 'tearDownGithubApp'>;

export function buildAppUninstallHandler(deps: Deps): Handler {
  return async (cmd) => {
    const parsed = payloadSchema.safeParse(cmd.payload ? JSON.parse(cmd.payload) : null);
    if (!parsed.success) return { ok: false, error: `invalid payload: ${parsed.error.message}` };

    // Spec 0050: the auto-rule cascade that lived here (R1 F1 from batch-2)
    // is gone with the rest of the approval-rules infrastructure. The SQLite
    // cascade on `connectors.app_id` still wipes every github-app-* connector
    // and its secrets atomically; nothing else needs cleanup.

    const githubApp = deps.getGithubApp();
    if (!githubApp) {
      logger.info(
        { event: 'app_uninstall_no_singleton', appUuid: parsed.data.appUuid },
        'app_uninstall: singleton already null (idempotent)',
      );
      return { ok: true };
    }

    try {
      deps.tearDownGithubApp();
      logger.info(
        { event: 'app_uninstall_complete', appUuid: parsed.data.appUuid },
        'GitHubAppAuth singleton torn down',
      );
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `tear-down failed: ${message}` };
    }
  };
}
