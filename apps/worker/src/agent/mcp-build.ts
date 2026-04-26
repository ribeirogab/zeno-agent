/**
 * Build the SDK's `mcpServers` option from the DB-managed connectors. Spec 0032.
 *
 * Two layers feed the agent's MCP map:
 *   1. agent/mcp.json — built-in MCPs (cron tools, etc.). Unchanged from the
 *      pre-cutover loader, kept in `loadAgentMcpConfig`.
 *   2. DB — user-managed connectors (`status='enabled'`).
 *
 * `profile/mcp.json` is no longer read. A boot-time warning lists any servers
 * declared there so the operator knows their old config is inert
 * (`warnIfMcpJsonExists`, in `mcp-cutover.ts`).
 */

import type { Logger } from '@zeno/logger';
import type { Connector, ConnectorRepo, ConnectorSecret } from '@zeno/storage';
import type { McpServerConfig } from '@/agent/mcp';
import { loadAgentMcpConfig } from '@/agent/mcp';

// Reserved secret keys consumed by the loader (not forwarded to the MCP).
// Spec 0033 reserves `__MCP_TYPE__` and `__MCP_AUTHORIZATION__` for the remote
// transport. The stdio path also recognizes them: `__MCP_TYPE__` is ignored
// (only relevant for remote URL classification); `__MCP_AUTHORIZATION__` is
// passed as the env var `AUTHORIZATION` if any stdio MCP cares to use it.
export const RESERVED_MCP_TYPE_KEY = '__MCP_TYPE__';
export const RESERVED_AUTHORIZATION_KEY = '__MCP_AUTHORIZATION__';

interface BuildMcpServersOptions {
  connectorRepo: ConnectorRepo;
  logger: Logger;
}

export function toStdioConfig(connector: Connector, secrets: ConnectorSecret[]): McpServerConfig {
  if (!connector.command) {
    throw new Error(`connector ${connector.slug} has transport=stdio but no command`);
  }
  const env: Record<string, string> = {};
  for (const s of secrets) {
    if (s.key === RESERVED_MCP_TYPE_KEY) continue;
    if (s.key === RESERVED_AUTHORIZATION_KEY) {
      env.AUTHORIZATION = s.value;
      continue;
    }
    env[s.key] = s.value;
  }
  return {
    type: 'stdio',
    command: connector.command,
    args: connector.args ?? [],
    env: Object.keys(env).length > 0 ? env : undefined,
  };
}

function pickRemoteType(url: string, override?: string): 'http' | 'sse' {
  if (override === 'http' || override === 'sse') return override;
  return /\/sse\/?$/i.test(url) ? 'sse' : 'http';
}

export function toRemoteConfig(connector: Connector, secrets: ConnectorSecret[]): McpServerConfig {
  if (!connector.url) {
    throw new Error(`connector ${connector.slug} has transport=remote but no url`);
  }
  const headers: Record<string, string> = {};
  let typeOverride: string | undefined;
  for (const s of secrets) {
    if (s.key === RESERVED_MCP_TYPE_KEY) {
      typeOverride = s.value;
      continue;
    }
    if (s.key === RESERVED_AUTHORIZATION_KEY) {
      headers.Authorization = s.value;
      continue;
    }
    headers[s.key] = s.value;
  }
  const type = pickRemoteType(connector.url, typeOverride);
  return {
    type,
    url: connector.url,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
  };
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
