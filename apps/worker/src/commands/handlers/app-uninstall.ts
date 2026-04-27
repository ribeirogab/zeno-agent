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
import type { ApprovalRulesRepo } from '@zeno/storage';
import { z } from 'zod';
import type { Handler } from '@/commands/dispatcher';
import type { HandlerDeps } from '@/commands/handlers';

const logger = createLogger({ service: 'worker' });

const payloadSchema = z.object({
  appUuid: z.string(),
});

type Deps = Pick<HandlerDeps, 'getGithubApp' | 'tearDownGithubApp'> & {
  approvalRules?: ApprovalRulesRepo;
};

export function buildAppUninstallHandler(deps: Deps): Handler {
  return async (cmd) => {
    const parsed = payloadSchema.safeParse(cmd.payload ? JSON.parse(cmd.payload) : null);
    if (!parsed.success) return { ok: false, error: `invalid payload: ${parsed.error.message}` };

    // Spec 0047 + R1 follow-up: cascade-delete every auto rule scoped to the
    // github-app catalog. The SQLite cascade (`connectors.app_id`) wipes
    // every github-app-* connector before this handler runs, so the
    // per-connector_uninstall cleanup never fires — without this, auto rules
    // like `mcp__github-app-<name>__merge_pull_request` become permanent
    // zombies. Manual + yaml-migrated rules are preserved (operator intent).
    if (deps.approvalRules) {
      const removedCount = deps.approvalRules.deleteAutoMatching('mcp__github-app-%');
      if (removedCount > 0) {
        logger.info(
          {
            event: 'approval_rules_auto_cascaded_app',
            appUuid: parsed.data.appUuid,
            removed: removedCount,
          },
          'auto-cascaded approval rules on app_uninstall',
        );
      }
    }

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
