import { existsSync, readFileSync } from 'node:fs';
import { logger } from '@/logger';

const PROFILE_CANDIDATES = ['/app/profile', 'profile'];

/**
 * MCP server configuration as accepted by the Claude Agent SDK's `mcpServers` option.
 * We support the stdio shape (command + args + env) and HTTP/SSE shape (type + url).
 * Underscore-prefixed fields (_comment, _disabled, _doc) are our convention and stripped before passing to the SDK.
 */
export interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  type?: 'http' | 'sse' | 'stdio';
  url?: string;
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

function findProfileFile(filename: string): string | null {
  for (const base of PROFILE_CANDIDATES) {
    const path = `${base}/${filename}`;
    if (existsSync(path)) return path;
  }
  return null;
}

/**
 * Load the MCP server config from profile/mcp.json.
 * Servers with `_disabled: true` are skipped.
 * Servers with unresolved env vars are skipped with a warning log.
 * Returns an object suitable for passing to the SDK's `mcpServers` option.
 */
export function loadMcpConfig(): Record<string, McpServerConfig> {
  const path = findProfileFile('mcp.json');
  if (!path) {
    logger.info(
      { event: 'mcp_config_missing' },
      'profile/mcp.json not found, no MCP servers loaded',
    );
    return {};
  }

  let parsed: McpFile;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    logger.error(
      { event: 'mcp_config_invalid', err: String(error), path },
      'profile/mcp.json is malformed, skipping all MCP servers',
    );
    return {};
  }

  const result: Record<string, McpServerConfig> = {};
  for (const [name, entry] of Object.entries(parsed.mcpServers ?? {})) {
    if (entry._disabled) {
      logger.debug({ event: 'mcp_server_disabled', name }, 'mcp server marked _disabled, skipping');
      continue;
    }

    const resolvedEnv = interpolateEnv(entry.env);
    if (resolvedEnv === null) {
      logger.warn(
        { event: 'mcp_server_skipped', name, reason: 'unresolved_env' },
        'mcp server has unresolved env var, skipping',
      );
      continue;
    }

    // Strip our convention fields before passing to SDK
    const { _comment, _disabled, ...sdkEntry } = entry;
    void _comment;
    void _disabled;
    if (resolvedEnv && Object.keys(resolvedEnv).length > 0) {
      sdkEntry.env = resolvedEnv;
    } else {
      sdkEntry.env = undefined;
    }

    result[name] = sdkEntry;
    logger.info({ event: 'mcp_server_enabled', name }, 'mcp server loaded');
  }
  return result;
}
