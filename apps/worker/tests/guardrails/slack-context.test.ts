import { describe, expect, it } from 'vitest';
import { parseRequesterUserId, parseSlackContext } from '@/guardrails/slack-context';

// Mirrors the wrapping done by AgentCore.wrapWithSlackContext so the parsers
// stay locked to the exact wire format. If that wrapper ever changes shape,
// this test is the canary.
function wrap(message: {
  conversationId: string;
  threadId: string | null;
  userId: string;
  text: string;
}): string {
  return [
    '[slack_context]',
    `conversation_id: ${message.conversationId}`,
    `thread_id: ${message.threadId ?? 'null'}`,
    `user_id: ${message.userId}`,
    `current_time: ${new Date().toISOString()}`,
    '[/slack_context]',
    '',
    message.text,
  ].join('\n');
}

describe('parseRequesterUserId', () => {
  it('extracts the user_id from a slack_context preamble', () => {
    const wrapped = wrap({
      conversationId: 'C_ENG',
      threadId: '1700.000',
      userId: 'U_OWNER',
      text: 'merge that PR',
    });
    expect(parseRequesterUserId(wrapped)).toBe('U_OWNER');
  });

  it('returns null when there is no slack_context block', () => {
    expect(parseRequesterUserId('just a plain message')).toBeNull();
  });
});

describe('parseSlackContext', () => {
  it('extracts conversation and thread from a wrapped message', () => {
    const wrapped = wrap({
      conversationId: 'C_ENG',
      threadId: '1700.000',
      userId: 'U_OWNER',
      text: 'merge that PR',
    });
    expect(parseSlackContext(wrapped)).toEqual({
      conversationId: 'C_ENG',
      threadId: '1700.000',
    });
  });

  it('treats a literal "null" thread_id as no thread', () => {
    const wrapped = wrap({
      conversationId: 'C_DM',
      threadId: null,
      userId: 'U_OWNER',
      text: 'hi',
    });
    expect(parseSlackContext(wrapped)).toEqual({
      conversationId: 'C_DM',
      threadId: null,
    });
  });

  it('returns empty conversation and null thread when no slack_context', () => {
    expect(parseSlackContext('plain text')).toEqual({
      conversationId: '',
      threadId: null,
    });
  });
});
