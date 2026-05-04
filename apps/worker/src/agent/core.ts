import { createLogger } from '@zeno/logger';
import type { SessionRepo } from '@zeno/storage';
import { NoBackendConfiguredError } from '@/agent/credentials';
import { type AgentBackend, AgentBackendError, type AgentInput } from '@/agent/types';
import type { Channel, IncomingMessage, MessageTarget } from '@/channels/types';

const logger = createLogger({ service: 'worker' });

interface AgentCoreOptions {
  backend: AgentBackend;
  workspaceDir: string;
  /** Returns the current system prompt. Called per turn so profile/ hot-reload takes effect on new sessions. */
  getSystemPrompt: () => string;
  /** Persistent store mapping Slack thread IDs to SDK session IDs. */
  sessions: SessionRepo;
  /**
   * Spec 0071 — fired when the backend returns auth_expired. The worker
   * uses this to flip `backend_credentials.status='expired'` so the
   * dashboard sidebar status dot turns red within the next polling tick.
   * Callback errors are caught + logged; they never block reply delivery.
   */
  onAuthExpired?: (backendId: string) => void;
}

export class AgentCore {
  constructor(private readonly opts: AgentCoreOptions) {}

  private async reportFailure(
    channel: Channel,
    target: MessageTarget,
    correlationId: string,
    error: unknown,
  ): Promise<void> {
    // Spec 0071: fire onAuthExpired side-effect (status update + future DM)
    // before the user-facing reply so the sidebar dot is already red by the
    // time the operator clicks through.
    if (
      this.opts.onAuthExpired &&
      error instanceof AgentBackendError &&
      error.kind === 'auth_expired'
    ) {
      try {
        this.opts.onAuthExpired('claude-code');
      } catch (cbErr) {
        logger.error(
          { event: 'auth_expired_callback_failed', correlationId, err: String(cbErr) },
          'onAuthExpired callback threw',
        );
      }
    }
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

      const resumeSessionId = message.threadId
        ? (this.opts.sessions.get(message.threadId) ?? undefined)
        : undefined;

      const agentInput: AgentInput = {
        systemPrompt: this.opts.getSystemPrompt(),
        userMessage: wrapWithSlackContext(message),
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
          const wasNew = this.opts.sessions.get(message.threadId) === null;
          this.opts.sessions.upsert(message.threadId, output.sessionId);
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
          if (message.threadId) this.opts.sessions.delete(message.threadId);
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
              this.opts.sessions.upsert(message.threadId, retryOutput.sessionId);
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

/**
 * Prepend a `[slack_context]` preamble so the agent can default cron tool args
 * (notify_conversation_id, notify_thread_id) to the current Slack target.
 * Concatenated into the user message — NOT into the system prompt — to keep the prompt cache valid.
 */
/** @internal Exported for testing only. */
export function wrapWithSlackContext(message: IncomingMessage): string {
  if (message.platform !== 'slack') return message.text;
  const lines = [
    '[slack_context]',
    `conversation_id: ${message.conversationId}`,
    `thread_id: ${message.threadId ?? 'null'}`,
    `user_id: ${message.userId}`,
    `current_time: ${new Date().toISOString()}`,
    '[/slack_context]',
  ];

  if (message.parentText) {
    lines.push('');
    lines.push('[parent_message]');
    lines.push(message.parentText);
    lines.push('[/parent_message]');
  }

  if (message.attachments?.length) {
    lines.push('');
    lines.push('[attached_files]');
    for (const attachment of message.attachments) {
      lines.push(`- ${attachment.localPath} (${attachment.mimetype}, ${attachment.name})`);
    }
    lines.push('[/attached_files]');
    lines.push('Read the attached files before responding.');
  }

  lines.push('');
  lines.push(message.text);
  return lines.join('\n');
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
  // Patterns we've seen in the wild from `@anthropic-ai/claude-agent-sdk`:
  //   "Claude Code returned an error result: No conversation found with session ID: <uuid>"
  //   "Session <uuid> not found"
  //   "no such session: <uuid>"
  //   "session expired"
  // Match any of them.
  return /resume|no conversation found|conversation.*not found|session.*(not found|invalid|expired|missing)|no such session/i.test(
    error.message,
  );
}

function translateError(error: unknown): string {
  if (error instanceof NoBackendConfiguredError) {
    // Spec 0071: graceful no-token reply pointing operator at the dashboard.
    return 'Claude ainda não está configurado. Abre o dashboard em http://localhost:3000 — vai ter um botão "Connect Claude" pra completar o OAuth.';
  }
  if (error instanceof AgentBackendError) {
    switch (error.kind) {
      case 'auth_expired':
        // Spec 0071: re-auth via dashboard, not .env.
        return 'meu token Claude expirou. Abre o dashboard em http://localhost:3000/settings/backend e clica "Re-authenticate".';
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
