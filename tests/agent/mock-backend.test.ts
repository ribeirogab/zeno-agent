import { describe, expect, it } from 'vitest';
import { MockBackend } from '@/agent/backends/mock';

function input(userMessage: string, resumeSessionId?: string) {
  return {
    systemPrompt: 'sys',
    userMessage,
    cwd: '/tmp',
    correlationId: 'corr-1',
    resumeSessionId,
  };
}

describe('MockBackend', () => {
  it('returns the matched fixture reply when a pattern hits', async () => {
    const backend = new MockBackend([{ match: /^oi/i, reply: 'olá!' }]);
    const out = await backend.query(input('Oi Zeno'));
    expect(out.text).toBe('olá!');
  });

  it('falls back to the default echo when no fixture matches', async () => {
    const backend = new MockBackend([]);
    const out = await backend.query(input('uma mensagem qualquer'));
    expect(out.text).toBe('[mock] você disse: "uma mensagem qualquer"');
  });

  it('strips the [slack_context] preamble before matching/echoing', async () => {
    const backend = new MockBackend([{ match: /^teste$/, reply: 'hit' }]);
    const wrapped = '[slack_context]\nconversation_id: C1\n[/slack_context]\n\nteste';
    const out = await backend.query(input(wrapped));
    expect(out.text).toBe('hit');
  });

  it('mints incremental session ids when none provided', async () => {
    const backend = new MockBackend([]);
    const a = await backend.query(input('a'));
    const b = await backend.query(input('b'));
    expect(a.sessionId).toBe('mock-sess-1');
    expect(b.sessionId).toBe('mock-sess-2');
  });

  it('honors resumeSessionId when provided', async () => {
    const backend = new MockBackend([]);
    const out = await backend.query(input('hi', 'mock-sess-99'));
    expect(out.sessionId).toBe('mock-sess-99');
  });

  it('returns no toolCalls', async () => {
    const backend = new MockBackend([]);
    const out = await backend.query(input('x'));
    expect(out.toolCalls).toEqual([]);
  });
});
