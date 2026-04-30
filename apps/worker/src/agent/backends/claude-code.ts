import { type HookCallback, query } from '@anthropic-ai/claude-agent-sdk';
import { createLogger } from '@zeno/logger';
import type { McpServerConfig } from '@/agent/mcp';
import {
  type AgentBackend,
  AgentBackendError,
  type AgentInput,
  type AgentOutput,
  type ToolCallSummary,
} from '@/agent/types';

const logger = createLogger({ service: 'worker' });

// biome-ignore lint/suspicious/noExplicitAny: an in-process MCP server returned by createSdkMcpServer; SDK types are not exported
type InProcessMcpServer = any;

/**
 * Reported back to a caller-provided callback after every tool call. Used by
 * the worker to populate `connector_invocations` and update `last_error` on
 * connectors when a tool from a DB-managed MCP fails.
 */
export interface InvocationEvent {
  toolName: string;
  durationMs: number;
  result: 'ok' | 'error';
  errorMessage: string | null;
  threadId: string | null;
  correlationId: string;
}

interface ClaudeCodeBackendOptions {
  /** Max wall-clock ms; on expiry the AbortController fires and raises kind=timeout. */
  timeoutMs?: number;
  /** Tools auto-approved. MVP: Bash only. */
  allowedTools?: string[];
  /** Static MCP servers (typically the in-process zeno tools). Merged with the dynamic getter. */
  mcpServers?: Record<string, McpServerConfig>;
  /** In-process MCP servers (e.g. cron tools) created via the SDK's createSdkMcpServer helper. */
  inProcessMcpServers?: Record<string, InProcessMcpServer>;
  /**
   * Optional dynamic MCP server map. Called once per `query()` to pick up DB
   * changes without restarting the worker. Spec 0032 — `getMcpServers` factory.
   * The dynamic map merges OVER `mcpServers` (dynamic wins on key conflict).
   */
  getMcpServers?: () => Record<string, McpServerConfig>;
  /**
   * Optional pre-tool-use hook. When provided, it fires before every tool call
   * via the SDK's `hooks.PreToolUse` mechanism and can allow or deny execution.
   * `permissionMode` switches to `'default'` so the hook is honored.
   */
  preToolUseHook?: HookCallback;
  /**
   * Optional callback fired once per tool result. Used by the worker to record
   * `connector_invocations` and update `last_error`. Spec 0032 P5.
   */
  onInvocation?: (event: InvocationEvent) => void;
  /** Environment variables for the SDK subprocess. Overrides process.env when set. */
  env?: Record<string, string | undefined>;
}

export class ClaudeCodeBackend implements AgentBackend {
  readonly name = 'claude-code';
  private readonly timeoutMs: number;
  private readonly allowedTools: string[];
  private readonly mcpServers: Record<string, McpServerConfig>;
  private readonly getMcpServers?: () => Record<string, McpServerConfig>;
  private readonly inProcessMcpServers: Record<string, InProcessMcpServer>;
  private readonly preToolUseHook?: HookCallback;
  private readonly onInvocation?: (event: InvocationEvent) => void;
  private readonly env?: Record<string, string | undefined>;

  constructor(opts: ClaudeCodeBackendOptions = {}) {
    this.timeoutMs = opts.timeoutMs ?? 3_600_000;
    this.allowedTools = opts.allowedTools ?? ['Bash', 'Read', 'Glob', 'Grep'];
    this.mcpServers = opts.mcpServers ?? {};
    this.getMcpServers = opts.getMcpServers;
    this.inProcessMcpServers = opts.inProcessMcpServers ?? {};
    this.preToolUseHook = opts.preToolUseHook;
    this.onInvocation = opts.onInvocation;
    this.env = opts.env;
  }

  async query(input: AgentInput): Promise<AgentOutput> {
    logger.info(
      { event: 'backend_started', backend: this.name, correlationId: input.correlationId },
      'starting claude agent SDK query',
    );

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    const toolCalls: ToolCallSummary[] = [];
    let finalText = '';
    let sessionId: string | undefined;

    // Track tool_use start times so we can compute duration on tool_result.
    // Keyed by SDK tool_use_id. Spec 0032 §Invocation logging.
    const toolUseStartedAt = new Map<string, { name: string; start: number }>();
    const threadId = parseThreadIdFromSlackContext(input.userMessage);
    const onInvocation = this.onInvocation;

    try {
      const iter = query({
        prompt: input.userMessage,
        options: {
          // Spec 0060: pass systemPrompt as preset+append (NOT bare string).
          // The Claude Agent SDK auto-announces ~/.claude/skills/* in the
          // `claude_code` preset's system prompt. A bare-string systemPrompt
          // replaces the preset entirely and silently drops the skill listing,
          // so the agent has zero awareness of installed skills (root cause
          // of spec 0060). With the preset shape, the SDK injects skill names
          // + descriptions; SOUL+USER are appended after the preset content.
          systemPrompt: {
            type: 'preset' as const,
            preset: 'claude_code' as const,
            append: input.systemPrompt,
          },
          allowedTools: this.allowedTools,
          cwd: input.cwd,
          permissionMode: this.preToolUseHook ? 'default' : 'bypassPermissions',
          ...(this.preToolUseHook
            ? { hooks: { PreToolUse: [{ hooks: [this.preToolUseHook] }] } }
            : {}),
          ...(this.env ? { env: this.env } : {}),
          settingSources: ['user'],
          abortController: controller,
          // biome-ignore lint/suspicious/noExplicitAny: SDK mcpServers union is stricter than our shape
          ...(this.buildMcpServers() as any),
          // Session handling: resume if sessionId provided, or explicitly disable persistence for stateless turns
          ...(input.resumeSessionId
            ? { resume: input.resumeSessionId }
            : input.persistSession === false
              ? { persistSession: false }
              : {}),
          stderr: (line) => {
            logger.warn(
              {
                event: 'sdk_stderr',
                correlationId: input.correlationId,
                line: line.slice(0, 1000),
              },
              'sdk stderr',
            );
          },
        },
      });

      for await (const message of iter) {
        if (
          message.type === 'result' &&
          'result' in message &&
          typeof message.result === 'string'
        ) {
          finalText = message.result;
          if ('session_id' in message && typeof message.session_id === 'string') {
            sessionId = message.session_id;
          }
        } else if (
          message.type === 'assistant' &&
          'message' in message &&
          Array.isArray(message.message?.content)
        ) {
          for (const block of message.message.content) {
            if (block.type === 'tool_use') {
              toolCalls.push({ tool: block.name, input: block.input });
              if ('id' in block && typeof block.id === 'string') {
                toolUseStartedAt.set(block.id, { name: block.name, start: Date.now() });
              }
              logger.info(
                {
                  event: 'backend_tool_call',
                  tool: block.name,
                  input: truncateToolInput(block.input),
                  correlationId: input.correlationId,
                },
                'tool call',
              );
            }
          }
        } else if (
          onInvocation &&
          message.type === 'user' &&
          'message' in message &&
          Array.isArray(message.message?.content)
        ) {
          // The SDK reports tool results as user-role messages with `tool_result` blocks.
          for (const block of message.message.content) {
            if (
              block &&
              typeof block === 'object' &&
              'type' in block &&
              block.type === 'tool_result' &&
              'tool_use_id' in block &&
              typeof block.tool_use_id === 'string'
            ) {
              const started = toolUseStartedAt.get(block.tool_use_id);
              if (!started) continue;
              toolUseStartedAt.delete(block.tool_use_id);
              const isError =
                'is_error' in block && typeof block.is_error === 'boolean' ? block.is_error : false;
              const errorMessage = isError ? extractErrorMessage(block) : null;
              try {
                onInvocation({
                  toolName: started.name,
                  durationMs: Date.now() - started.start,
                  result: isError ? 'error' : 'ok',
                  errorMessage,
                  threadId,
                  correlationId: input.correlationId,
                });
              } catch (err) {
                logger.error(
                  {
                    event: 'invocation_callback_failed',
                    correlationId: input.correlationId,
                    err: String(err),
                  },
                  'onInvocation callback threw',
                );
              }
            }
          }
        }
      }
    } catch (error) {
      // biome-ignore lint/suspicious/noExplicitAny: debug logging the full error shape
      const errorAny = error as any;
      logger.error(
        {
          event: 'backend_error_raw',
          correlationId: input.correlationId,
          message: errorAny?.message,
          name: errorAny?.name,
          code: errorAny?.code,
          stderr: errorAny?.stderr,
          stdout: errorAny?.stdout,
          cause: errorAny?.cause ? String(errorAny.cause).slice(0, 500) : undefined,
          stack: errorAny?.stack?.split('\n').slice(0, 5),
        },
        'raw SDK error',
      );
      throw classifyError(error, this.timeoutMs, controller.signal.aborted);
    } finally {
      clearTimeout(timer);
    }

    logger.info(
      {
        event: 'backend_completed',
        backend: this.name,
        correlationId: input.correlationId,
        toolCalls: toolCalls.length,
      },
      'claude completed',
    );

    return { text: finalText || '(sem resposta)', toolCalls, sessionId };
  }

  /**
   * Merge config-driven MCP servers (static + dynamic via getMcpServers) with
   * in-process ones into the SDK's mcpServers option. The dynamic getter is
   * called ONCE per query() so per-turn DB reads are bounded; spec 0032.
   */
  private buildMcpServers(): { mcpServers?: Record<string, McpServerConfig> } {
    const dynamic = this.getMcpServers ? this.getMcpServers() : {};
    const merged: Record<string, McpServerConfig> = {
      ...this.mcpServers,
      ...dynamic,
      ...(this.inProcessMcpServers as Record<string, McpServerConfig>),
    };
    if (Object.keys(merged).length === 0) return {};
    return { mcpServers: merged };
  }
}

/** Extract a Slack thread id from the user message preamble, or null. */
function parseThreadIdFromSlackContext(userMessage: string): string | null {
  const match = userMessage.match(/thread_id=([^\s\]]+)/);
  return match ? (match[1] ?? null) : null;
}

/**
 * Pull a usable error string out of a `tool_result` block reported as an error.
 * The SDK's content shape varies; we try a few common shapes and fall back to
 * the JSON of the block.
 */
function extractErrorMessage(block: { content?: unknown }): string {
  const content = block.content;
  if (typeof content === 'string') return content.slice(0, 500);
  if (Array.isArray(content)) {
    for (const part of content) {
      if (
        part &&
        typeof part === 'object' &&
        'type' in part &&
        part.type === 'text' &&
        'text' in part &&
        typeof part.text === 'string'
      ) {
        return part.text.slice(0, 500);
      }
    }
  }
  try {
    return JSON.stringify(content).slice(0, 500);
  } catch {
    return 'tool error (unserializable content)';
  }
}

/**
 * Truncate each string field in a tool input to keep log lines bounded.
 * Keeps enough of the value (e.g. a command) to identify what the tool did.
 */
function truncateToolInput(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  const truncated: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof value === 'string' && value.length > 500) {
      truncated[key] = `${value.slice(0, 500)}…(${value.length} chars)`;
    } else {
      truncated[key] = value;
    }
  }
  return truncated;
}

function classifyError(error: unknown, timeoutMs: number, aborted: boolean): AgentBackendError {
  if (aborted) {
    return new AgentBackendError('timeout', `claude exceeded ${timeoutMs}ms`, error);
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/authenticat|oauth|unauthorized|401|CLAUDE_CODE_OAUTH_TOKEN/i.test(message)) {
    return new AgentBackendError('auth_expired', 'Claude OAuth token invalid or expired', error);
  }
  if (/rate limit|usage limit|usage cap|quota/i.test(message)) {
    return new AgentBackendError('rate_limited', 'Claude plan limit reached', error);
  }
  return new AgentBackendError('unknown', `claude SDK failure: ${message.slice(0, 400)}`, error);
}
