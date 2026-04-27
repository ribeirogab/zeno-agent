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
import type { ConnectorRepo } from '@zeno/storage';
import type { McpServerConfig } from '@/agent/mcp';
import { loadAgentMcpConfig } from '@/agent/mcp';

export { RESERVED_AUTHORIZATION_KEY, RESERVED_MCP_TYPE_KEY, toRemoteConfig, toStdioConfig };

interface BuildMcpServersOptions {
  connectorRepo: ConnectorRepo;
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
      const config =
        connector.transport === 'stdio'
          ? toStdioConfig(connector, secrets)
          : toRemoteConfig(connector, secrets);
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
