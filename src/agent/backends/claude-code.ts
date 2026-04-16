import { query } from '@anthropic-ai/claude-agent-sdk';
import type { McpServerConfig } from '@/agent/mcp';
import {
  type AgentBackend,
  AgentBackendError,
  type AgentInput,
  type AgentOutput,
  type ToolCallSummary,
} from '@/agent/types';
import { logger } from '@/logger';

interface ClaudeCodeBackendOptions {
  /** Max wall-clock ms; on expiry the AbortController fires and raises kind=timeout. */
  timeoutMs?: number;
  /** Tools auto-approved. MVP: Bash only. */
  allowedTools?: string[];
  /** MCP servers loaded from profile/mcp.json. Passed verbatim to the SDK. */
  mcpServers?: Record<string, McpServerConfig>;
}

export class ClaudeCodeBackend implements AgentBackend {
  readonly name = 'claude-code';
  private readonly timeoutMs: number;
  private readonly allowedTools: string[];
  private readonly mcpServers: Record<string, McpServerConfig>;

  constructor(opts: ClaudeCodeBackendOptions = {}) {
    this.timeoutMs = opts.timeoutMs ?? 300_000;
    this.allowedTools = opts.allowedTools ?? ['Bash', 'Read', 'Glob', 'Grep'];
    this.mcpServers = opts.mcpServers ?? {};
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

    try {
      const iter = query({
        prompt: input.userMessage,
        options: {
          systemPrompt: input.systemPrompt,
          allowedTools: this.allowedTools,
          cwd: input.cwd,
          permissionMode: 'bypassPermissions',
          abortController: controller,
          ...(Object.keys(this.mcpServers).length > 0
            ? // biome-ignore lint/suspicious/noExplicitAny: SDK mcpServers type has stricter discriminated union than our config shape
              { mcpServers: this.mcpServers as any }
            : {}),
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
              logger.debug(
                {
                  event: 'backend_tool_call',
                  tool: block.name,
                  correlationId: input.correlationId,
                },
                'tool call',
              );
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
