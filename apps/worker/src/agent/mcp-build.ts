/**
 * Build the SDK's `mcpServers` option from the DB-managed connectors. Spec 0032.
 *
 * The transport-specific helpers (`toStdioConfig`, `toRemoteConfig`) and the
 * reserved-key constants live in `@zeno/mcp-discover` and are re-exported here
 * for backward-compatible imports. This file owns the worker-side concerns:
 *   - reading agent/mcp.json (built-ins)
 *   - applying user connectors from the DB
 *   - persisting `last_error` when a connector fails to build
 */

import type { Logger } from '@zeno/logger';
import {
  RESERVED_AUTHORIZATION_KEY,
  RESERVED_MCP_TYPE_KEY,
  toRemoteConfig,
  toStdioConfig,
} from '@zeno/mcp-discover';
import type { ConnectorRepo, ConnectorSecret } from '@zeno/storage';
import type { McpServerConfig } from '@/agent/mcp';
import { loadAgentMcpConfig } from '@/agent/mcp';
import { GITHUB_APP_RESERVED_KEYS, type GitHubAppAuth } from '@/github/app-auth';

export { RESERVED_AUTHORIZATION_KEY, RESERVED_MCP_TYPE_KEY, toRemoteConfig, toStdioConfig };

interface BuildMcpServersOptions {
  connectorRepo: ConnectorRepo;
  /** Optional. When set, github-app-* connectors get a fresh installation token. Spec 0042. */
  githubApp?: GitHubAppAuth | null;
  logger: Logger;
}

/**
 * Build the merged map handed to the SDK. Built-ins from `agent/mcp.json` are
 * loaded first; DB-managed user connectors land second and win on collision
 * (matches the prior file-based "profile overrides agent" rule).
 *
 * Errors from constructing a single connector's config are caught: the
 * connector is recorded with `last_error` set and skipped from this turn's
 * map. The rest of the map still loads.
 */
export function buildMcpServersMap(opts: BuildMcpServersOptions): Record<string, McpServerConfig> {
  const agentServers = loadAgentMcpConfig();
  const userLayer = opts.connectorRepo.getEnabledWithRelations();

  const merged: Record<string, McpServerConfig> = { ...agentServers };
  for (const { connector, secrets } of userLayer) {
    try {
      // Spec 0042: github-app-* connectors get a synthetic PAT secret minted
      // from the cached installation token. The five __GITHUB_*__ reserved
      // keys are NEVER forwarded to the github-mcp-server subprocess.
      let effectiveSecrets: ConnectorSecret[] = secrets;
      if (connector.slug.startsWith('github-app-')) {
        if (!opts.githubApp) {
          throw new Error('github-app connector requires githubApp auth instance');
        }
        const map = new Map(secrets.map((s) => [s.key, s.value]));
        const installationName = map.get(GITHUB_APP_RESERVED_KEYS.INSTALLATION_NAME);
        if (!installationName) {
          throw new Error(
            `github-app connector ${connector.slug} missing __GITHUB_INSTALLATION_NAME__`,
          );
        }
        const token = opts.githubApp.getCachedToken(installationName);
        if (!token) {
          throw new Error(
            `github-app token cache miss for installation "${installationName}" — refresh interval will populate it on the next cycle`,
          );
        }
        effectiveSecrets = [
          {
            connectorId: connector.id,
            key: 'GITHUB_PERSONAL_ACCESS_TOKEN',
            value: token,
          },
        ];
      }

      const config =
        connector.transport === 'stdio'
          ? toStdioConfig(connector, effectiveSecrets)
          : toRemoteConfig(connector, effectiveSecrets);
      if (merged[connector.slug]) {
        opts.logger.info(
          { event: 'connector_overrides_builtin', slug: connector.slug },
          'connector overrides built-in MCP',
        );
      }
      merged[connector.slug] = config;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      opts.logger.warn(
        { event: 'connector_skipped', slug: connector.slug, err: message },
        'connector failed to build, skipping this turn',
      );
      try {
        opts.connectorRepo.update(connector.id, {
          lastError: message.slice(0, 500),
          lastErrorAt: new Date().toISOString(),
        });
      } catch (updateErr) {
        opts.logger.error(
          {
            event: 'connector_last_error_write_failed',
            slug: connector.slug,
            err: String(updateErr),
          },
          'failed to persist connector last_error',
        );
      }
    }
  }

  return merged;
}
