import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Connector, ConnectorSecret, ToolCategory } from '@zeno/storage';
import { toRemoteConfig, toStdioConfig } from './build-config.js';

export interface DiscoveredTool {
  name: string;
  description: string | null;
  category: ToolCategory;
}

export type DiscoverErrorKind = 'auth' | 'network' | 'timeout' | 'spawn' | 'unknown';

export type DiscoverToolsResult =
  | { tools: DiscoveredTool[]; durationMs: number }
  | { error: string; errorKind: DiscoverErrorKind };

const DISCOVER_TIMEOUT_MS = 10_000;

const READ_PREFIXES = ['read_', 'list_', 'get_', 'search_', 'find_'];
const WRITE_PREFIXES = ['create_', 'update_', 'delete_', 'send_', 'post_', 'put_'];

export function classifyToolCategory(name: string): ToolCategory {
  const lower = name.toLowerCase();
  if (READ_PREFIXES.some((p) => lower.startsWith(p))) return 'read';
  if (WRITE_PREFIXES.some((p) => lower.startsWith(p))) return 'write';
  return 'interactive';
}

interface RawTool {
  name: string;
  description?: string | null;
}

function classifyError(err: unknown): { error: string; errorKind: DiscoverErrorKind } {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  if (/401|403|unauthorized|forbidden|authenticat/.test(lower)) {
    return { error: message.slice(0, 500), errorKind: 'auth' };
  }
  if (/timeout|timed out/.test(lower)) {
    return { error: message.slice(0, 500), errorKind: 'timeout' };
  }
  if (/enotfound|econnrefused|enetunreach|getaddrinfo|fetch failed|network/.test(lower)) {
    return { error: message.slice(0, 500), errorKind: 'network' };
  }
  if (/enoent|spawn|command not found|permission denied/.test(lower)) {
    return { error: message.slice(0, 500), errorKind: 'spawn' };
  }
  return { error: message.slice(0, 500), errorKind: 'unknown' };
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout (${ms}ms)`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export async function discoverTools(
  connector: Connector,
  secrets: ConnectorSecret[],
): Promise<DiscoverToolsResult> {
  const start = Date.now();
  const client = new Client({ name: 'zeno-discover', version: '0.1.0' }, { capabilities: {} });

  try {
    if (connector.transport === 'stdio') {
      const config = toStdioConfig(connector, secrets);
      if (!config.command) throw new Error('connector has transport=stdio but no command');
      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args ?? [],
        ...(config.env ? { env: config.env } : {}),
      });
      await withTimeout(client.connect(transport), DISCOVER_TIMEOUT_MS);
    } else {
      const config = toRemoteConfig(connector, secrets);
      if (!config.url) throw new Error('connector has transport=remote but no url');
      const url = new URL(config.url);
      const headers = config.headers;
      const requestInit = headers ? { headers } : undefined;
      const transport =
        config.type === 'sse'
          ? new SSEClientTransport(url, requestInit ? { requestInit } : {})
          : new StreamableHTTPClientTransport(url, requestInit ? { requestInit } : {});
      await withTimeout(client.connect(transport as never), DISCOVER_TIMEOUT_MS);
    }

    const result = await withTimeout(client.listTools(), DISCOVER_TIMEOUT_MS);
    const tools: DiscoveredTool[] = (result.tools as RawTool[]).map((t) => ({
      name: t.name,
      description: t.description ?? null,
      category: classifyToolCategory(t.name),
    }));
    return { tools, durationMs: Date.now() - start };
  } catch (err) {
    return classifyError(err);
  } finally {
    try {
      await client.close();
    } catch {
      // best effort
    }
  }
}
