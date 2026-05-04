import { describe, expect, it } from 'vitest';
import { normalizeSlackEvent } from '@/channels/slack/normalize';

const BOT_USER_ID = 'UBOT';

describe('normalizeSlackEvent', () => {
  it('normalizes app_mention in a channel and strips the mention', () => {
    const raw = {
      type: 'app_mention',
      user: 'U1',
      channel: 'C1',
      ts: '1710000000.000100',
      thread_ts: undefined,
      text: '<@UBOT> what repos are in acme-org?',
    };
    const message = normalizeSlackEvent(raw, BOT_USER_ID);
    expect(message).not.toBeNull();
    if (!message) return;
    expect(message.platform).toBe('slack');
    expect(message.userId).toBe('U1');
    expect(message.conversationId).toBe('C1');
    expect(message.threadId).toBe('1710000000.000100');
    expect(message.text).toBe('what repos are in acme-org?');
    expect(message.messageRef).toBe('1710000000.000100');
    expect(message.correlationId).toMatch(/^[0-9a-f-]+$/);
  });

  it('preserves thread_ts when the mention is inside an existing thread', () => {
    const raw = {
      type: 'app_mention',
      user: 'U1',
      channel: 'C1',
      ts: '1710000100.000200',
      thread_ts: '1710000000.000100',
      text: '<@UBOT> follow up here',
    };
    const message = normalizeSlackEvent(raw, BOT_USER_ID);
    expect(message?.threadId).toBe('1710000000.000100');
    expect(message?.messageRef).toBe('1710000100.000200');
  });

  it('normalizes a direct message (channel_type=im), threadId is null', () => {
    const raw = {
      type: 'message',
      channel_type: 'im',
      user: 'U1',
      channel: 'D1',
      ts: '1710000000.000100',
      text: 'hi',
    };
    const message = normalizeSlackEvent(raw, BOT_USER_ID);
    expect(message?.threadId).toBeNull();
    expect(message?.conversationId).toBe('D1');
    expect(message?.text).toBe('hi');
  });

  it('returns null for bot messages (to avoid loops)', () => {
    const raw = {
      type: 'message',
      channel_type: 'channel',
      bot_id: 'B123',
      user: 'UBOT',
      channel: 'C1',
      ts: '1710000000.000100',
      text: 'echo',
    };
    expect(normalizeSlackEvent(raw, BOT_USER_ID)).toBeNull();
  });

  it('returns null for unsupported event shapes', () => {
    expect(normalizeSlackEvent({ type: 'file_shared' }, BOT_USER_ID)).toBeNull();
  });
});
