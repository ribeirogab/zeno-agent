import { App, LogLevel } from '@slack/bolt';
import { createLogger } from '@zeno/logger';
import { downloadSlackFiles, type SlackFile } from '@/channels/slack/files';
import { toSlackMrkdwn } from '@/channels/slack/format';
import { normalizeSlackEvent } from '@/channels/slack/normalize';
import type { Channel, MessageHandler, MessageTarget, ReactionEvent } from '@/channels/types';

interface ReactionAddedEvent {
  item?: { ts?: string; channel?: string };
  reaction?: string;
  user?: string;
}

const logger = createLogger({ service: 'worker' });

interface SlackEventPayload {
  channel_type?: string;
  files?: SlackFile[];
}

interface SlackChannelOptions {
  appToken: string;
  botToken: string;
  /** When set, only this user can DM the bot. Other DMs are silently ignored. */
  dmOwnerUserId?: string;
  /** Root directory for the workspace; file attachments are saved under `<workspaceDir>/uploads/`. Defaults to `/workspace`. */
  workspaceDir?: string;
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

    const dispatch = async ({ event }: { event: unknown }) => {
      const slackEvent = event as SlackEventPayload;
      const message = normalizeSlackEvent(event, this.botUserId as string);
      if (!message || !this.handler) return;
      if (
        this.opts.dmOwnerUserId &&
        slackEvent.channel_type === 'im' &&
        message.userId !== this.opts.dmOwnerUserId
      ) {
        logger.info(
          { event: 'dm_ignored_non_owner', userId: message.userId },
          'DM from non-owner ignored',
        );
        return;
      }

      // Download file attachments when present
      if (Array.isArray(slackEvent.files) && slackEvent.files.length > 0) {
        const workspaceDir = this.opts.workspaceDir ?? '/workspace';
        message.attachments = await downloadSlackFiles(
          slackEvent.files,
          this.opts.botToken,
          message.correlationId,
          workspaceDir,
        );
      }

      logger.info(
        {
          event: 'message_received',
          platform: 'slack',
          userId: message.userId,
          correlationId: message.correlationId,
          attachments: message.attachments?.length ?? 0,
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

  async send(target: MessageTarget, text: string): Promise<{ messageRef: string }> {
    if (target.platform !== 'slack') {
      throw new Error(`Unsupported platform: ${target.platform}`);
    }
    const result = await this.app.client.chat.postMessage({
      token: this.opts.botToken,
      channel: target.conversationId,
      thread_ts: target.threadId ?? undefined,
      text: toSlackMrkdwn(text),
    });
    if (!result.ts) {
      throw new Error('chat.postMessage returned no ts');
    }
    return { messageRef: String(result.ts) };
  }

  async openDm(userId: string): Promise<string> {
    const result = await this.app.client.conversations.open({
      token: this.opts.botToken,
      users: userId,
    });
    const id = result.channel?.id;
    if (!id) throw new Error('conversations.open returned no channel id');
    return id;
  }

  async waitForReaction(
    target: MessageTarget,
    emojis: string[],
    timeoutMs: number,
    expectedUserId?: string,
  ): Promise<ReactionEvent | null> {
    if (!target.messageRef) return null;
    return new Promise((resolve) => {
      let settled = false;
      const settle = (value: ReactionEvent | null): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      };
      const listener = async ({ event }: { event: unknown }): Promise<void> => {
        if (settled) return;
        const reactionEvent = event as ReactionAddedEvent;
        if (reactionEvent.item?.ts !== target.messageRef) return;
        if (reactionEvent.item?.channel !== target.conversationId) return;
        const reaction = reactionEvent.reaction;
        if (!reaction || !emojis.includes(reaction)) return;
        const user = reactionEvent.user;
        if (expectedUserId && user !== expectedUserId) return;
        if (!user) return;
        settle({ emoji: reaction, userId: user });
      };
      this.app.event('reaction_added', listener);
      const timer = setTimeout(() => settle(null), timeoutMs);
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
      if (isSlackErrorCode(error, 'already_reacted')) return;
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
      if (isSlackErrorCode(error, 'no_reaction')) return;
      throw error;
    }
  }

  async stop(): Promise<void> {
    await this.app.stop();
    logger.info({ event: 'slack_disconnected' }, 'Slack disconnected');
  }
}

/** Narrow a Slack API error to check its `.data.error` code without using `any`. */
function isSlackErrorCode(error: unknown, code: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const data = (error as Record<string, unknown>).data;
  if (typeof data !== 'object' || data === null) return false;
  return (data as Record<string, unknown>).error === code;
}
