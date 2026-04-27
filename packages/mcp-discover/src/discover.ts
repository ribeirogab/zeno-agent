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
  // Auth bucket: HTTP statuses, common error words, plus phrasings real MCPs
  // emit (Sentry uses "Authorization Expired ... rejected the stored access
  // token"; Linear uses "invalid_token" / "Invalid access token"). Spec 0038 F#2 + spec 0039.
  if (
    /401|403|unauthorized|forbidden|authenticat|authorization (expired|invalid|rejected)|invalid (token|credentials|access token|api key)|invalid_token|access token (rejected|invalid|expired)/.test(
      lower,
    )
  ) {
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

/**
 * Optional configuration for `discoverTools`.
 *
 * Spec 0038 F#2: `authCheckTool` lets the catalog declare a tool name the
 * discovery layer should call after a successful `tools/list` to verify
 * credentials are real. Without this hop, `tools/list` may succeed even
 * with an invalid token (the Sentry MCP, e.g., returns its tool list
 * without authenticating). Calling a real tool surfaces auth failure
 * deterministically.
 */
export interface DiscoverOptions {
  /**
   * If set and the tool exists in the result of `tools/list`, the discovery
   * layer calls `client.callTool({ name: authCheckTool, arguments: <see authCheckArgs> })`
   * with the same 10s timeout. An MCP-style or HTTP-style auth error from
   * that call returns `{ errorKind: 'auth' }`. If the named tool is not
   * present in the live `tools/list`, a warning is logged (best-effort)
   * and the auth check is skipped — discovery continues with the listed
   * tools as if no auth check had been requested.
   */
  authCheckTool?: string;
  /**
   * Optional arguments to pass to the auth-check tool. Defaults to `{}`.
   * Some MCPs (e.g. Klaviyo) require a non-empty argument shape on every
   * tool call (validation errors otherwise) — without args the auth check
   * misclassifies the validation error as `unknown`. Spec 0040.
   */
  authCheckArgs?: Record<string, unknown>;
}

export async function discoverTools(
  connector: Connector,
  secrets: ConnectorSecret[],
  options?: DiscoverOptions,
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

    // Spec 0038 F#2: optional auth probe. After tools/list, call a designated
    // tool to confirm the credentials actually work. tools/list is unauthed
    // on some MCPs (Sentry's, notably), so without this hop a bad token
    // would pass the test endpoints silently.
    if (options?.authCheckTool) {
      const present = tools.some((t) => t.name === options.authCheckTool);
      if (!present) {
        // Catalog drift: the auth-check tool is no longer exposed by the
        // MCP. Don't fail discovery — this is a misconfiguration to surface
        // in operator review, not a test failure. Logged to stderr (best
        // effort; mcp-discover has no logger dep).
        console.warn(
          `discoverTools: authCheckTool="${options.authCheckTool}" not present in tools/list; skipping auth check (catalog drift?)`,
        );
      } else {
        try {
          const callResult = (await withTimeout(
            client.callTool({
              name: options.authCheckTool,
              arguments: options.authCheckArgs ?? {},
            }),
            DISCOVER_TIMEOUT_MS,
          )) as { isError?: boolean; content?: Array<{ type?: string; text?: string }> };
          // The SDK encodes tool-level errors as `{ isError: true, content: [...] }`
          // rather than throwing. We extract the error text and run it through
          // classifyError so 401/403/Unauthorized text → errorKind: 'auth'.
          // Spec 0041: some MCPs (e.g. smattila/mcp-swarmia) return auth failures
          // with `isError: false` and the error string embedded in content text.
          // Also inspect content for auth patterns when isError is unset/false.
          const contentText = Array.isArray(callResult?.content)
            ? callResult.content.map((c) => (c?.type === 'text' ? (c.text ?? '') : '')).join(' ')
            : '';
          if (callResult?.isError) {
            return classifyError(new Error(contentText || 'auth check tool returned an error'));
          }
          if (contentText) {
            const probe = classifyError(new Error(contentText));
            if (probe.errorKind === 'auth') {
              return probe;
            }
          }
        } catch (err) {
          // Synchronous throws (transport-level / MCP protocol errors).
          return classifyError(err);
        }
      }
    }

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
