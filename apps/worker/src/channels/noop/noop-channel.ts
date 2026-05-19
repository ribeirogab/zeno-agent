import type { Logger } from '@zeno/logger';
import type {
  Channel,
  MessageHandler,
  MessageTarget,
  OutgoingMessage,
  ReactionEvent,
} from '@/channels/types';

/**
 * No-op channel used when Slack is not installed yet. Lets the worker boot
 * (so the dashboard at apps/api becomes reachable) and the operator install
 * Slack via /connectors. Once installed + container restarted, the real
 * SlackChannel is wired instead.
 *
 * All outbound calls (send / react / openDm) throw a clear error explaining
 * that no channel is installed. Inbound has no listener, so nothing arrives.
 * Cron firings that need to deliver fail loud at the channel boundary; cron
 * runs with no `notify_conversation_id` are short-circuited upstream and
 * never call into this stub.
 */
export class NoopChannel implements Channel {
  readonly name = 'noop';

  constructor(private readonly logger: Logger) {}

  async start(_onMessage: MessageHandler): Promise<void> {
    this.logger.warn(
      { event: 'channel_noop_started' },
      'no channel installed — worker is online, install Slack via dashboard /connectors and restart',
    );
  }

  async send(_target: MessageTarget, _message: OutgoingMessage): Promise<{ messageRef: string }> {
    throw new Error('no channel installed — install Slack via dashboard /connectors and restart');
  }

  async react(_target: MessageTarget, _emoji: string): Promise<void> {
    throw new Error('no channel installed — install Slack via dashboard /connectors and restart');
  }

  async unreact(_target: MessageTarget, _emoji: string): Promise<void> {
    throw new Error('no channel installed — install Slack via dashboard /connectors and restart');
  }

  async waitForReaction(
    _target: MessageTarget,
    _emojis: string[],
    _timeoutMs: number,
    _expectedUserId?: string,
  ): Promise<ReactionEvent | null> {
    return null;
  }

  async openDm(_userId: string): Promise<string> {
    throw new Error('no channel installed — install Slack via dashboard /connectors and restart');
  }

  async stop(): Promise<void> {
    /* no-op */
  }
}
