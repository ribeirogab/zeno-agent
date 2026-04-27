import { existsSync, readFileSync } from 'node:fs';
import { createLogger } from '@zeno/logger';

const logger = createLogger({ service: 'worker' });

const AGENT_CANDIDATES = ['/app/agent', 'agent'];
export const PROFILE_CANDIDATES = ['/app/profile', 'profile'];

type Layer = 'agent' | 'profile';

/**
 * MCP server configuration as accepted by the Claude Agent SDK's `mcpServers` option.
 * We support the stdio shape (command + args + env) and HTTP/SSE shape (type + url + headers).
 * Underscore-prefixed fields (_comment, _disabled, _doc) are our convention and stripped before passing to the SDK.
 */
export interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  type?: 'http' | 'sse' | 'stdio';
  url?: string;
  headers?: Record<string, string>;
}

interface McpFileEntry extends McpServerConfig {
  _comment?: string;
  _disabled?: boolean;
}

interface McpFile {
  _doc?: string;
  mcpServers?: Record<string, McpFileEntry>;
}

const ENV_VAR_PATTERN = /\$\{([A-Z0-9_]+)\}/g;

/**
 * Replace ${VAR_NAME} occurrences in a string with process.env values.
 * Returns null if any required env var is missing.
 */
function interpolateString(value: string): string | null {
  let missing = false;
  const result = value.replace(ENV_VAR_PATTERN, (_match, varName: string) => {
    const resolved = process.env[varName];
    if (resolved === undefined || resolved === '') {
      missing = true;
      return '';
    }
    return resolved;
  });
  return missing ? null : result;
}

/**
 * Walk an env map and interpolate every string value.
 * Returns null if any value cannot be resolved (missing env var).
 */
function interpolateEnv(env: Record<string, string> | undefined): Record<string, string> | null {
  if (!env) return undefined as unknown as Record<string, string>;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    const resolved = interpolateString(value);
    if (resolved === null) return null;
    out[key] = resolved;
  }
  return out;
}

function findFile(candidates: string[], filename: string): string | null {
  for (const base of candidates) {
    const path = `${base}/${filename}`;
    if (existsSync(path)) return path;
  }
  return null;
}

/** Load and resolve one mcp.json file from the given candidate list. */
function loadLayer(
  layer: Layer,
  candidates: string[],
  filename: string,
): Record<string, McpServerConfig> {
  const path = findFile(candidates, filename);
  if (!path) {
    logger.info(
      { event: 'mcp_config_missing', layer },
      `${layer}/${filename} not found, no MCP servers from this layer`,
    );
    return {};
  }

  let parsed: McpFile;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    logger.error(
      { event: 'mcp_config_invalid', layer, err: String(error), path },
      `${layer}/${filename} is malformed, skipping all MCP servers from this layer`,
    );
    return {};
  }

  const result: Record<string, McpServerConfig> = {};
  for (const [name, entry] of Object.entries(parsed.mcpServers ?? {})) {
    if (entry._disabled) {
      logger.debug(
        { event: 'mcp_server_disabled', name, layer },
        'mcp server marked _disabled, skipping',
      );
      continue;
    }

    const resolvedEnv = interpolateEnv(entry.env);
    if (resolvedEnv === null) {
      logger.warn(
        { event: 'mcp_server_skipped', name, layer, reason: 'unresolved_env' },
        'mcp server has unresolved env var, skipping',
      );
      continue;
    }

    const { _comment, _disabled, ...sdkEntry } = entry;
    void _comment;
    void _disabled;
    if (resolvedEnv && Object.keys(resolvedEnv).length > 0) {
      sdkEntry.env = resolvedEnv;
    } else {
      sdkEntry.env = undefined;
    }

    result[name] = sdkEntry;
    logger.info({ event: 'mcp_server_enabled', name, layer }, 'mcp server loaded');
  }
  return result;
}

/**
 * Load only the agent-layer MCP config (built-in MCPs from agent/mcp.json).
 * Spec 0032 — `profile/mcp.json` is no longer read; user MCPs come from the
 * DB via `buildMcpServersMap` in `mcp-build.ts`.
 */
export function loadAgentMcpConfig(): Record<string, McpServerConfig> {
  return loadLayer('agent', AGENT_CANDIDATES, 'mcp.json');
}
