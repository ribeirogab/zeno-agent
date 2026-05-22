import type { ConnectorAppRepo, ConnectorRepo } from '@zeno/db/runtime';
import type { AgentBackend } from '@/agent/types';
import type { HandlerMap } from '@/commands/dispatcher';
import { buildAppInstallHandler } from '@/commands/handlers/app-install';
import { buildAppUninstallHandler } from '@/commands/handlers/app-uninstall';
import { buildConnectorCreateHandler } from '@/commands/handlers/connector-create';
import { buildConnectorRefreshToolsHandler } from '@/commands/handlers/connector-refresh-tools';
import { buildConnectorUninstallHandler } from '@/commands/handlers/connector-uninstall';
import { buildConnectorUpdateHandler } from '@/commands/handlers/connector-update';
import { buildCronTestHandler } from '@/commands/handlers/cron-test';
import type { GitHubAppAuth } from '@/github/app-auth';

export interface HandlerDeps {
  connectors: ConnectorRepo;
  /** Spec 0044: ConnectorApp repo for `connector_apps` table mutations. */
  connectorApps: ConnectorAppRepo;
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
  /** Spec 2026-05-22 (crons CLI-first): agent backend used by cron_test handler. */
  getCronBackend: () => AgentBackend | null;
}

export function buildHandlerMap(deps: HandlerDeps): HandlerMap {
  return {
    // Cron CRUD command handlers removed in spec 2026-05-22 (crons CLI-first):
    // crons are now filesystem-managed. Only the one-shot `cron_test` survives,
    // driven by `zeno cron test <slug>`.
    cron_test: buildCronTestHandler({ getBackend: deps.getCronBackend }),
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
