import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from '@/channels/types';

/**
 * Convert a Slack Bolt event payload into a normalized IncomingMessage.
 * Returns null for events we don't handle (bot messages, file shares, etc.).
 */
// biome-ignore lint/suspicious/noExplicitAny: Bolt event payloads are loosely typed at this boundary
export function normalizeSlackEvent(raw: any, botUserId: string): IncomingMessage | null {
  if (!raw || typeof raw !== 'object') return null;

  // Ignore bot-authored messages to prevent loops
  if (raw.bot_id || raw.user === botUserId) return null;

  const isMention = raw.type === 'app_mention';
  const isDirectMessage = raw.type === 'message' && raw.channel_type === 'im';
  if (!isMention && !isDirectMessage) return null;

  const userId: string | undefined = raw.user;
  const conversationId: string | undefined = raw.channel;
  const timestamp: string | undefined = raw.ts;
  const threadTs: string | undefined = raw.thread_ts;
  const rawText: string = typeof raw.text === 'string' ? raw.text : '';

  if (!userId || !conversationId || !timestamp) return null;

  // Strip leading bot mention (e.g. '<@UBOT> foo bar' -> 'foo bar')
  const mentionPattern = new RegExp(`^\\s*<@${botUserId}>\\s*`);
  const text = rawText.replace(mentionPattern, '').trim();

  // threadId logic:
  //   - mention with thread_ts -> thread_ts (reply in that thread)
  //   - mention without thread_ts -> ts (start a thread using this message)
  //   - DM -> null (DMs don't have threads)
  const threadId: string | null = isDirectMessage ? null : (threadTs ?? timestamp);

  return {
    platform: 'slack',
    userId,
    conversationId,
    threadId,
    text,
    correlationId: randomUUID(),
    messageRef: timestamp,
    raw,
  };
}
