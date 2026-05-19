import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { SessionRepo } from '@zeno/db/runtime';
import { createLogger } from '@zeno/logger';
import { collectOutbox } from '@/agent/collect-outbox';
import { NoBackendConfiguredError } from '@/agent/credentials';
import { type AgentBackend, AgentBackendError, type AgentInput } from '@/agent/types';
import type { Channel, IncomingMessage, MessageTarget, OutgoingMessage } from '@/channels/types';

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
    await channel.send(target, { text: reply });
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

      const outboxDir = join(this.opts.workspaceDir, 'outbox', message.correlationId);
      let outboxReady = false;
      try {
        await mkdir(outboxDir, { recursive: true });
        outboxReady = true;
        logger.info(
          { event: 'outbox_created', correlationId: message.correlationId, path: outboxDir },
          'outbox dir ready',
        );
      } catch (err) {
        logger.error(
          {
            event: 'outbox_mkdir_failed',
            correlationId: message.correlationId,
            path: outboxDir,
            err: String(err).slice(0, 200),
          },
          'failed to create outbox dir; proceeding without outbox surface',
        );
      }

      try {
        const resumeSessionId = message.threadId
          ? (this.opts.sessions.get(message.threadId) ?? undefined)
          : undefined;

        const agentInput: AgentInput = {
          systemPrompt: this.opts.getSystemPrompt(),
          userMessage: wrapWithChannelContext(message, {
            outboxDir: outboxReady ? outboxDir : undefined,
          }),
          cwd: this.opts.workspaceDir,
          correlationId: message.correlationId,
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

        let replyText: string;
        let replySessionId: string | undefined;
        try {
          const output = await this.opts.backend.query(agentInput);
          replyText = output.text;
          replySessionId = output.sessionId;
        } catch (firstError) {
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
              replyText = retryOutput.text;
              replySessionId = retryOutput.sessionId;
            } catch (retryError) {
              await this.reportFailure(channel, target, message.correlationId, retryError);
              return;
            }
          } else {
            await this.reportFailure(channel, target, message.correlationId, firstError);
            return;
          }
        }

        const attachments = outboxReady ? await collectOutbox(outboxDir) : [];
        if (outboxReady) {
          logger.info(
            {
              event: 'outbox_collected',
              correlationId: message.correlationId,
              path: outboxDir,
              count: attachments.length,
              totalBytes: attachments.reduce((sum, a) => sum + a.sizeBytes, 0),
            },
            'outbox collected',
          );
        }

        const outgoing: OutgoingMessage =
          attachments.length > 0 ? { text: replyText, attachments } : { text: replyText };

        await channel.send(target, outgoing);
        await safe(() => channel.unreact(target, 'eyes'));
        await safe(() => channel.react(target, 'white_check_mark'));

        if (message.threadId && replySessionId) {
          const wasNew = this.opts.sessions.get(message.threadId) === null;
          this.opts.sessions.upsert(message.threadId, replySessionId);
          if (wasNew) {
            logger.info(
              {
                event: 'session_created',
                correlationId: message.correlationId,
                threadId: message.threadId,
                sessionId: replySessionId,
              },
              'session created',
            );
          }
        }

        logger.info(
          { event: 'response_sent', correlationId: message.correlationId },
          'response sent',
        );
      } finally {
        if (outboxReady) {
          try {
            await rm(outboxDir, { recursive: true, force: true });
            logger.info(
              { event: 'outbox_cleaned', correlationId: message.correlationId, path: outboxDir },
              'outbox cleaned',
            );
          } catch (err) {
            logger.warn(
              {
                event: 'outbox_cleanup_failed',
                correlationId: message.correlationId,
                path: outboxDir,
                err: String(err).slice(0, 200),
              },
              'failed to clean outbox dir',
            );
          }
        }
      }
    };
  }
}

/**
 * Prepend optional channel-context blocks to the user's message text.
 *
 * - `[slack_context]` + `[parent_message]`: emitted only when `platform === 'slack'`.
 *   Lets the agent default cron tool args (notify_conversation_id, notify_thread_id)
 *   to the current Slack target.
 * - `[attached_files]`: emitted whenever `attachments?.length > 0`, regardless of platform.
 *   This is the channel-agnostic surface — any future channel adapter that populates
 *   `IncomingMessage.attachments[]` gets prompt surfacing for free.
 *
 * Concatenated into the user message — NOT into the system prompt — to keep the
 * prompt cache valid.
 */
/** @internal Exported for testing only. */
export function wrapWithChannelContext(
  message: IncomingMessage,
  opts: { outboxDir?: string } = {},
): string {
  const lines: string[] = [];

  // Slack-specific context blocks (gated by platform).
  if (message.platform === 'slack') {
    lines.push(
      '[slack_context]',
      `conversation_id: ${message.conversationId}`,
      `thread_id: ${message.threadId ?? 'null'}`,
      `user_id: ${message.userId}`,
      `current_time: ${new Date().toISOString()}`,
      '[/slack_context]',
    );

    if (message.parentText) {
      lines.push('');
      lines.push('[parent_message]');
      lines.push(message.parentText);
      lines.push('[/parent_message]');
    }
  }

  // Universal: any channel that populates attachments[] gets injection.
  if (message.attachments?.length) {
    if (lines.length) lines.push('');
    lines.push('[attached_files]');
    for (const attachment of message.attachments) {
      lines.push(`- ${attachment.localPath} (${attachment.mimetype}, ${attachment.name})`);
    }
    lines.push('[/attached_files]');
    lines.push('Read the attached files before responding.');
  }

  // Universal outbox surface: tells the agent where to write files for upload.
  if (opts.outboxDir) {
    if (lines.length) lines.push('');
    lines.push('[outbox]');
    lines.push(opts.outboxDir);
    lines.push(
      'Write any file you want to send to the user into this directory. The channel adapter will upload them alongside your reply.',
    );
    lines.push('[/outbox]');
  }

  // No context blocks at all → return raw text unchanged.
  if (!lines.length) return message.text;

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
