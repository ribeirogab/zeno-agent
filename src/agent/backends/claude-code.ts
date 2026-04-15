import { query } from '@anthropic-ai/claude-agent-sdk';
import {
  type AgentBackend,
  AgentBackendError,
  type AgentInput,
  type AgentOutput,
  type ToolCallSummary,
} from '@/agent/types';
import { logger } from '@/logger';

export interface ClaudeCodeBackendOptions {
  /** Max wall-clock ms; on expiry the AbortController fires and raises kind=timeout. */
  timeoutMs?: number;
  /** Tools auto-approved. MVP: Bash only. */
  allowedTools?: string[];
}

export class ClaudeCodeBackend implements AgentBackend {
  readonly name = 'claude-code';
  private readonly timeoutMs: number;
  private readonly allowedTools: string[];

  constructor(opts: ClaudeCodeBackendOptions = {}) {
    this.timeoutMs = opts.timeoutMs ?? 60_000;
    this.allowedTools = opts.allowedTools ?? ['Bash'];
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

    try {
      const iter = query({
        prompt: input.userMessage,
        options: {
          systemPrompt: input.systemPrompt,
          allowedTools: this.allowedTools,
          cwd: input.cwd,
          permissionMode: 'bypassPermissions',
          abortController: controller,
        },
      });

      for await (const message of iter) {
        if (
          message.type === 'result' &&
          'result' in message &&
          typeof message.result === 'string'
        ) {
          finalText = message.result;
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

    return { text: finalText || '(sem resposta)', toolCalls };
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
