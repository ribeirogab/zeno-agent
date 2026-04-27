/**
 * `app_pem_rotated` command handler. Spec 0044.
 *
 * Triggered after the API has SYNCHRONOUSLY validated the new PEM and updated
 * the `connector_apps` row. The handler reads the new PEM back from the DB
 * (single source of truth — see Spec 0044 review F1) and swaps it on the
 * in-memory singleton.
 *
 * The API has already done all the validation (sign JWT, GET /app, mint a
 * test token for every installation). If we get here, we're committing the
 * change to the running process.
 */

import { createLogger } from '@zeno/logger';
import { z } from 'zod';
import type { Handler } from '@/commands/dispatcher';
import type { HandlerDeps } from '@/commands/handlers';

const logger = createLogger({ service: 'worker' });

const payloadSchema = z.object({
  appUuid: z.string(),
});

type Deps = Pick<HandlerDeps, 'getGithubApp' | 'connectorApps'>;

export function buildAppPemRotatedHandler(deps: Deps): Handler {
  return async (cmd) => {
    const parsed = payloadSchema.safeParse(cmd.payload ? JSON.parse(cmd.payload) : null);
    if (!parsed.success) return { ok: false, error: `invalid payload: ${parsed.error.message}` };

    const githubApp = deps.getGithubApp();
    if (!githubApp) {
      // No singleton yet (worker rebooted between API write and command
      // dispatch). On next boot, loadGitHubAppFromDb will pick up the new
      // PEM directly — so this is a soft failure, not a data integrity
      // issue. Mark failed so the operator can see the trail.
      logger.warn(
        { event: 'app_pem_rotated_no_singleton', appUuid: parsed.data.appUuid },
        'app_pem_rotated received but GitHubAppAuth singleton is null; will pick up on next worker boot',
      );
      return { ok: false, error: 'github_app_not_loaded' };
    }

    // Read the new PEM back from the DB (the API already wrote it). This
    // keeps `connector_apps.pem` as the single source of truth and avoids
    // persisting the PEM in the commands.payload TEXT column.
    const row = deps.connectorApps.get(parsed.data.appUuid);
    if (!row) {
      return { ok: false, error: 'connector_apps row not found' };
    }

    try {
      await githubApp.rotatePem(row.pem);
      logger.info(
        { event: 'app_pem_rotated', appUuid: parsed.data.appUuid },
        'PEM rotated in memory; all caches invalidated',
      );
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `pem rotation failed: ${message}` };
    }
  };
}
