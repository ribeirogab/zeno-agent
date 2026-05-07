import type { Logger } from '@zeno/logger';
import type { ConnectorRepo } from '@zeno/storage';

/**
 * Resolves Slack credentials from the connector DB. Returns null when Slack is
 * not installed or its secrets are incomplete — letting the worker boot
 * without a channel so the dashboard at apps/api stays reachable for the
 * operator to install Slack via /connectors. Once installed + restarted, the
 * real SlackChannel takes over from the NoopChannel fallback.
 *
 * Synchronous because better-sqlite3 is synchronous.
 *
 * Cases:
 *   1. enabled DB row + both secrets → returns creds
 *   2. enabled + missing secret → log warn, return null (treat as not installed)
 *   3. disabled / pending row → return null
 *   4. no DB row at all → return null
 */

export interface SlackCredentialsResolverDeps {
  connectors: ConnectorRepo;
  logger: Logger;
}

export interface ResolvedSlackCredentials {
  appToken: string;
  botToken: string;
}

export function resolveSlackCredentials(
  deps: SlackCredentialsResolverDeps,
): ResolvedSlackCredentials | null {
  const { connectors, logger } = deps;
  const slack = connectors
    .listByKind('channel')
    .find((c) => c.slug === 'slack' && c.status === 'enabled');

  if (!slack) {
    logger.warn(
      { event: 'slack_creds_missing' },
      'Slack channel not installed — boot continuing without it; install via dashboard /connectors',
    );
    return null;
  }

  const secrets = connectors.getSecrets(slack.id);
  const appToken = secrets.find((s) => s.key === 'SLACK_APP_TOKEN')?.value;
  const botToken = secrets.find((s) => s.key === 'SLACK_BOT_TOKEN')?.value;

  if (!appToken || !botToken) {
    logger.warn(
      { event: 'slack_creds_empty_after_install', connectorId: slack.id },
      'Slack channel installed but credentials missing — boot continuing without it; fix via dashboard',
    );
    return null;
  }

  logger.info(
    { event: 'slack_creds_resolved', connectorId: slack.id },
    'Slack creds resolved from DB',
  );
  return { appToken, botToken };
}
