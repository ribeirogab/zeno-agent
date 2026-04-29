import type { Logger } from '@zeno/logger';
import type { ConnectorRepo } from '@zeno/storage';

/**
 * Spec 0057: resolve Slack credentials at worker boot.
 *
 * Resolution table (deterministic, no side effects):
 *   1. enabled DB row + both secrets → DB creds (source: connector_secrets)
 *   2. enabled DB row + missing secret → HARD ERROR (operator misconfig)
 *   3. disabled/pending row → fall through to env (treated as not installed)
 *   4. no DB row at all → fall through to env
 *   5. env present → env creds (source: env_fallback)
 *   6. env missing → HARD ERROR
 *
 * Synchronous because better-sqlite3 is synchronous.
 */

export interface SlackCredentialsResolverDeps {
  connectors: ConnectorRepo;
  env: { appToken: string | undefined; botToken: string | undefined };
  logger: Logger;
}

export interface ResolvedSlackCredentials {
  appToken: string;
  botToken: string;
  source: 'connector_secrets' | 'env_fallback';
}

export function resolveSlackCredentials(
  deps: SlackCredentialsResolverDeps,
): ResolvedSlackCredentials {
  const { connectors, env, logger } = deps;

  const allChannels = connectors.listByKind('channel');
  const slack = allChannels.find((c) => c.slug === 'slack' && c.status === 'enabled');

  if (slack) {
    const secrets = connectors.getSecrets(slack.id);
    const appToken = secrets.find((s) => s.key === 'SLACK_APP_TOKEN')?.value;
    const botToken = secrets.find((s) => s.key === 'SLACK_BOT_TOKEN')?.value;

    if (!appToken || !botToken) {
      const msg =
        'Slack channel installed but credentials missing — fix via dashboard or uninstall the channel';
      logger.error(
        { event: 'slack_creds_empty_after_install', connectorId: slack.id },
        msg,
      );
      throw new Error(msg);
    }

    logger.info(
      {
        event: 'slack_creds_resolved',
        slack_creds_source: 'connector_secrets',
        connectorId: slack.id,
      },
      'Slack creds: connector_secrets',
    );
    return { appToken, botToken, source: 'connector_secrets' };
  }

  // No enabled Slack channel — fall through to env (handles cases 3, 4, 5)
  if (env.appToken && env.botToken) {
    logger.info(
      { event: 'slack_creds_resolved', slack_creds_source: 'env_fallback' },
      'Slack creds: env_fallback',
    );
    return { appToken: env.appToken, botToken: env.botToken, source: 'env_fallback' };
  }

  // Case 6: no DB row + no env
  const msg =
    'Slack credentials not configured — install Slack channel via dashboard or set SLACK_APP_TOKEN/SLACK_BOT_TOKEN in profile .env';
  logger.error({ event: 'slack_creds_missing' }, msg);
  throw new Error(msg);
}
