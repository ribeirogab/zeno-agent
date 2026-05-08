import type { ConnectorAppRepo, ConnectorRepo, CronRepo, CronRunRepo } from '@zeno/db/runtime';
import type { HandlerMap } from '@/commands/dispatcher';
import { buildAppInstallHandler } from '@/commands/handlers/app-install';
import { buildAppUninstallHandler } from '@/commands/handlers/app-uninstall';
import { buildConnectorCreateHandler } from '@/commands/handlers/connector-create';
import { buildConnectorRefreshToolsHandler } from '@/commands/handlers/connector-refresh-tools';
import { buildConnectorUninstallHandler } from '@/commands/handlers/connector-uninstall';
import { buildConnectorUpdateHandler } from '@/commands/handlers/connector-update';
import { buildCreateHandler } from '@/commands/handlers/create';
import { buildDeleteHandler } from '@/commands/handlers/delete';
import { buildPauseHandler } from '@/commands/handlers/pause';
import { buildResumeHandler } from '@/commands/handlers/resume';
import { buildRunNowHandler, type RunnerLike } from '@/commands/handlers/run-now';
import type { GitHubAppAuth } from '@/github/app-auth';

export interface HandlerDeps {
  crons: CronRepo;
  cronRuns: CronRunRepo;
  connectors: ConnectorRepo;
  /** Spec 0044: ConnectorApp repo for `connector_apps` table mutations. */
  connectorApps: ConnectorAppRepo;
  runner: RunnerLike;
  exit: (code: number) => void;
  /**
   * Spec 0044: getter for the (mutable) GitHubAppAuth singleton. Handlers
   * read it lazily so they observe the current value (which can change
   * between commands when an `app_install` happens after worker boot).
   */
  getGithubApp: () => GitHubAppAuth | null;
  /** Spec 0044: bootstrap on first install (after worker booted). */
  bootstrapGithubApp: () => Promise<GitHubAppAuth | null>;
  /** Spec 0044: tear down singleton on `app_uninstall`. */
  tearDownGithubApp: () => void;
}

export function buildHandlerMap(deps: HandlerDeps): HandlerMap {
  return {
    cron_create: buildCreateHandler(deps.crons),
    cron_pause: buildPauseHandler(deps.crons),
    cron_resume: buildResumeHandler(deps.crons),
    cron_run_now: buildRunNowHandler(deps.crons, deps.runner),
    cron_delete: buildDeleteHandler(deps.crons),
    connector_create: buildConnectorCreateHandler({
      connectors: deps.connectors,
      getGithubApp: deps.getGithubApp,
    }),
    connector_update: buildConnectorUpdateHandler(deps),
    connector_refresh_tools: buildConnectorRefreshToolsHandler({
      connectors: deps.connectors,
      getGithubApp: deps.getGithubApp,
    }),
    connector_uninstall: buildConnectorUninstallHandler({
      connectors: deps.connectors,
      getGithubApp: deps.getGithubApp,
    }),
    app_install: buildAppInstallHandler(deps),
    app_uninstall: buildAppUninstallHandler({
      getGithubApp: deps.getGithubApp,
      tearDownGithubApp: deps.tearDownGithubApp,
    }),
  };
}
