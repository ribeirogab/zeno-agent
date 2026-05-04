import type { Logger } from '@zeno/logger';
import type { ConnectorRepo } from '@zeno/storage';

/**
 * Spec 0058: simplified Slack credentials resolver. The 6-row resolution table
 * shipped in spec 0057 collapses to 4 cases now that the .env fallback path is
 * removed:
 *
 *   1. enabled DB row + both secrets → returns creds
 *   2. enabled + missing secret → HARD ERROR (operator misconfig)
 *   3. disabled / pending row → HARD ERROR (treated identically to "no row")
 *   4. no DB row at all → HARD ERROR (Slack channel not installed)
 *
 * Synchronous because better-sqlite3 is synchronous.
 *
 * Spec 0057's `env_fallback` path (cases 3 + 5 of the old table) is gone —
 * the operator's profile cut over to DB-only credentials in spec 0058 and
 * the fallback code became unreachable. New profiles MUST install Slack via
 * dashboard.
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
): ResolvedSlackCredentials {
  const { connectors, logger } = deps;
  const slack = connectors
    .listByKind('channel')
    .find((c) => c.slug === 'slack' && c.status === 'enabled');

  if (!slack) {
    const msg = 'Slack channel not installed — install via dashboard at /connectors';
    logger.error({ event: 'slack_creds_missing' }, msg);
    throw new Error(msg);
  }

  const secrets = connectors.getSecrets(slack.id);
  const appToken = secrets.find((s) => s.key === 'SLACK_APP_TOKEN')?.value;
  const botToken = secrets.find((s) => s.key === 'SLACK_BOT_TOKEN')?.value;

  if (!appToken || !botToken) {
    const msg = 'Slack channel installed but credentials missing — fix via dashboard or uninstall';
    logger.error({ event: 'slack_creds_empty_after_install', connectorId: slack.id }, msg);
    throw new Error(msg);
  }

  logger.info(
    { event: 'slack_creds_resolved', connectorId: slack.id },
    'Slack creds resolved from DB',
  );
  return { appToken, botToken };
}
