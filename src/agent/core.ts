import type { Channel, IncomingMessage, MessageTarget } from '../channels/types.js';
import { logger } from '../logger.js';
import { type AgentBackend, AgentBackendError } from './types.js';

export interface AgentCoreOptions {
  backend: AgentBackend;
  workspaceDir: string;
  /** Full system prompt (built once at boot via buildSystemPrompt). */
  systemPrompt: string;
}

export class AgentCore {
  constructor(private readonly opts: AgentCoreOptions) {}

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

      try {
        const output = await this.opts.backend.query({
          systemPrompt: this.opts.systemPrompt,
          userMessage: message.text,
          cwd: this.opts.workspaceDir,
          correlationId: message.correlationId,
        });

        await channel.send(target, output.text);
        await safe(() => channel.unreact(target, 'eyes'));
        await safe(() => channel.react(target, 'white_check_mark'));

        logger.info(
          { event: 'response_sent', correlationId: message.correlationId },
          'response sent',
        );
      } catch (error) {
        const reply = translateError(error);
        await channel.send(target, reply);
        await safe(() => channel.unreact(target, 'eyes'));
        await safe(() => channel.react(target, 'warning'));

        logger.error(
          {
            event: 'handler_failed',
            correlationId: message.correlationId,
            err: String(error),
          },
          'core handler failed',
        );
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
