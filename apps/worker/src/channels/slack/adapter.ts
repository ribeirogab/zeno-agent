import { App, LogLevel } from '@slack/bolt';
import { createLogger } from '@zeno/logger';
import { toSlackMrkdwn } from '@/channels/slack/format';
import { normalizeSlackEvent } from '@/channels/slack/normalize';
import type { Channel, MessageHandler, MessageTarget } from '@/channels/types';

const logger = createLogger({ service: 'worker' });

interface SlackChannelOptions {
  appToken: string;
  botToken: string;
}

export class SlackChannel implements Channel {
  readonly name = 'slack';
  private readonly app: App;
  private botUserId: string | null = null;
  private handler: MessageHandler | null = null;

  constructor(private readonly opts: SlackChannelOptions) {
    this.app = new App({
      token: opts.botToken,
      appToken: opts.appToken,
      socketMode: true,
      logLevel: LogLevel.WARN,
    });
  }

  async start(onMessage: MessageHandler): Promise<void> {
    this.handler = onMessage;

    const auth = await this.app.client.auth.test({ token: this.opts.botToken });
    this.botUserId = (auth.user_id as string) ?? null;
    if (!this.botUserId) {
      throw new Error('Slack auth.test did not return user_id');
    }

    // biome-ignore lint/suspicious/noExplicitAny: Bolt event payloads are loosely typed
    const dispatch = async ({ event }: { event: any }) => {
      const message = normalizeSlackEvent(event, this.botUserId as string);
      if (!message || !this.handler) return;
      logger.info(
        {
          event: 'message_received',
          platform: 'slack',
          userId: message.userId,
          correlationId: message.correlationId,
        },
        'slack message received',
      );
      try {
        await this.handler(message);
      } catch (error) {
        logger.error(
          {
            event: 'handler_error',
            correlationId: message.correlationId,
            err: String(error),
          },
          'handler threw',
        );
      }
    };

    this.app.event('app_mention', dispatch);
    this.app.message(dispatch);

    await this.app.start();
    logger.info({ event: 'slack_connected', botUserId: this.botUserId }, 'Slack connected');
  }

  async send(target: MessageTarget, text: string): Promise<void> {
    if (target.platform !== 'slack') {
      throw new Error(`Unsupported platform: ${target.platform}`);
    }
    await this.app.client.chat.postMessage({
      token: this.opts.botToken,
      channel: target.conversationId,
      thread_ts: target.threadId ?? undefined,
      text: toSlackMrkdwn(text),
    });
  }

  async react(target: MessageTarget, emoji: string): Promise<void> {
    if (!target.messageRef) return;
    try {
      await this.app.client.reactions.add({
        token: this.opts.botToken,
        channel: target.conversationId,
        timestamp: target.messageRef,
        name: emoji,
      });
    } catch (error) {
      // biome-ignore lint/suspicious/noExplicitAny: Slack errors carry data via .data.error
      const errorCode = (error as any)?.data?.error;
      if (errorCode === 'already_reacted') return;
      throw error;
    }
  }

  async unreact(target: MessageTarget, emoji: string): Promise<void> {
    if (!target.messageRef) return;
    try {
      await this.app.client.reactions.remove({
        token: this.opts.botToken,
        channel: target.conversationId,
        timestamp: target.messageRef,
        name: emoji,
      });
    } catch (error) {
      // biome-ignore lint/suspicious/noExplicitAny: Slack errors carry data via .data.error
      const errorCode = (error as any)?.data?.error;
      if (errorCode === 'no_reaction') return;
      throw error;
    }
  }

  async stop(): Promise<void> {
    await this.app.stop();
    logger.info({ event: 'slack_disconnected' }, 'Slack disconnected');
  }
}
