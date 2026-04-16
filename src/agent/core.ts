import { type AgentBackend, AgentBackendError, type AgentInput } from '@/agent/types';
import type { Channel, IncomingMessage, MessageTarget } from '@/channels/types';
import { logger } from '@/logger';

interface AgentCoreOptions {
  backend: AgentBackend;
  workspaceDir: string;
  /** Full system prompt (built once at boot via buildSystemPrompt). */
  systemPrompt: string;
}

export class AgentCore {
  /** Maps Slack thread IDs to SDK session IDs for multi-turn conversations. */
  private readonly sessionMap = new Map<string, string>();

  constructor(private readonly opts: AgentCoreOptions) {}

  private async reportFailure(
    channel: Channel,
    target: MessageTarget,
    correlationId: string,
    error: unknown,
  ): Promise<void> {
    const reply = translateError(error);
    await channel.send(target, reply);
    await safe(() => channel.unreact(target, 'eyes'));
    await safe(() => channel.react(target, 'warning'));
    logger.error(
      { event: 'handler_failed', correlationId, err: String(error) },
      'core handler failed',
    );
  }

  /**
   * Binds the core to a channel. The channel calls back with IncomingMessage;
   * core runs the backend and replies through the same channel.
   */
  bind(channel: Channel): (msg: IncomingMessage) => Promise<void> {
    return async (message: IncomingMessage) => {
      const target: MessageTarget = {
        platform: message.platform,
        conversationId: message.conversationId,
        threadId: message.threadId,
        messageRef: message.messageRef,
      };

      await safe(() => channel.react(target, 'eyes'));

      const resumeSessionId = message.threadId ? this.sessionMap.get(message.threadId) : undefined;

      const agentInput: AgentInput = {
        systemPrompt: this.opts.systemPrompt,
        userMessage: message.text,
        cwd: this.opts.workspaceDir,
        correlationId: message.correlationId,
        // Messages without a thread (DM first msg) are stateless — don't persist the SDK session
        persistSession: message.threadId == null ? false : undefined,
        resumeSessionId,
      };

      if (resumeSessionId) {
        logger.info(
          {
            event: 'session_resumed',
            correlationId: message.correlationId,
            threadId: message.threadId,
            sessionId: resumeSessionId,
          },
          'resuming session',
        );
      }

      try {
        const output = await this.opts.backend.query(agentInput);

        await channel.send(target, output.text);
        await safe(() => channel.unreact(target, 'eyes'));
        await safe(() => channel.react(target, 'white_check_mark'));

        // Store the session mapping for this thread
        if (message.threadId && output.sessionId) {
          const wasNew = !this.sessionMap.has(message.threadId);
          this.sessionMap.set(message.threadId, output.sessionId);
          if (wasNew) {
            logger.info(
              {
                event: 'session_created',
                correlationId: message.correlationId,
                threadId: message.threadId,
                sessionId: output.sessionId,
              },
              'session created',
            );
          }
        }

        logger.info(
          { event: 'response_sent', correlationId: message.correlationId },
          'response sent',
        );
      } catch (firstError) {
        // If this was a resume attempt and it failed, clear the stale mapping and retry fresh
        if (resumeSessionId && isResumeFailure(firstError)) {
          if (message.threadId) this.sessionMap.delete(message.threadId);
          logger.warn(
            {
              event: 'session_resume_failed',
              correlationId: message.correlationId,
              threadId: message.threadId,
              staleSessionId: resumeSessionId,
            },
            'stale session, starting fresh',
          );
          try {
            const retryOutput = await this.opts.backend.query({
              ...agentInput,
              resumeSessionId: undefined,
            });
            await channel.send(target, retryOutput.text);
            await safe(() => channel.unreact(target, 'eyes'));
            await safe(() => channel.react(target, 'white_check_mark'));
            if (message.threadId && retryOutput.sessionId) {
              this.sessionMap.set(message.threadId, retryOutput.sessionId);
            }
            return;
          } catch (retryError) {
            await this.reportFailure(channel, target, message.correlationId, retryError);
            return;
          }
        }

        await this.reportFailure(channel, target, message.correlationId, firstError);
      }
    };
  }
}

async function safe(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch {
    // swallow — non-critical reaction ops
  }
}

function isResumeFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /resume|session.*(not found|invalid|expired|missing)|no such session/i.test(error.message);
}

function translateError(error: unknown): string {
  if (error instanceof AgentBackendError) {
    switch (error.kind) {
      case 'auth_expired':
        return 'meu token Claude expirou. Roda `docker compose run --rm zeno-agent claude setup-token`, cola o token novo em `.env` e `docker compose up -d --force-recreate`.';
      case 'rate_limited':
        return 'bati o limite do plano Claude. Tenta daqui a pouco.';
      case 'timeout':
        return 'demorei demais pra responder. Tenta simplificar a pergunta?';
      default:
        return 'deu ruim aqui dentro. Olha os logs pra detalhes.';
    }
  }
  return 'deu ruim aqui dentro. Olha os logs pra detalhes.';
}
