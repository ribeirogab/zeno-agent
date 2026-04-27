import type { Connector, ConnectorSecret } from '@zeno/storage';

/**
 * MCP server config shape accepted by both the Claude Agent SDK and the
 * `@modelcontextprotocol/sdk` client. Stdio uses command/args/env; remote
 * uses type/url/headers.
 */
export interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  type?: 'http' | 'sse' | 'stdio';
  url?: string;
  headers?: Record<string, string>;
}

// Reserved secret keys consumed by the loader (not forwarded to the MCP).
// Spec 0033 + Spec 0042.
export const RESERVED_MCP_TYPE_KEY = '__MCP_TYPE__';
export const RESERVED_AUTHORIZATION_KEY = '__MCP_AUTHORIZATION__';
// Spec 0042: github-app composite secret keys. Worker (`mcp-build.ts`) handles
// these specially — mints an installation token at MCP spawn and substitutes
// `GITHUB_PERSONAL_ACCESS_TOKEN`. They must NEVER be forwarded to the
// github-mcp-server subprocess; this skip list is defense-in-depth.
const GITHUB_APP_RESERVED_KEYS_SET = new Set([
  '__GITHUB_APP_ID__',
  '__GITHUB_APP_PEM__',
  '__GITHUB_INSTALLATION_ID__',
  '__GITHUB_INSTALLATION_NAME__',
  '__GITHUB_ENV_VAR__',
]);

export function toStdioConfig(connector: Connector, secrets: ConnectorSecret[]): McpServerConfig {
  if (!connector.command) {
    throw new Error(`connector ${connector.slug} has transport=stdio but no command`);
  }
  const env: Record<string, string> = {};
  for (const s of secrets) {
    if (s.key === RESERVED_MCP_TYPE_KEY) continue;
    if (GITHUB_APP_RESERVED_KEYS_SET.has(s.key)) continue;
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
    ...(Object.keys(env).length > 0 ? { env } : {}),
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
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
  };
}
