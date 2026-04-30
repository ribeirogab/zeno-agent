import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the SDK module BEFORE importing the unit under test
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({ query: vi.fn() }));

import { query } from '@anthropic-ai/claude-agent-sdk';
import { ClaudeCodeBackend } from '@/agent/backends/claude-code';

// biome-ignore lint/suspicious/noExplicitAny: SDK message stream is loosely typed in tests
function mockQueryStream(messages: any[]): void {
  vi.mocked(query).mockImplementation(() => {
    async function* gen() {
      for (const message of messages) yield message;
    }
    // biome-ignore lint/suspicious/noExplicitAny: cast to satisfy the SDK return type
    return gen() as any;
  });
}

function mockQueryThrow(error: Error): void {
  vi.mocked(query).mockImplementation(() => {
    async function* gen() {
      throw error;
      // biome-ignore lint/correctness/noUnreachable: required to satisfy AsyncGenerator type
      yield undefined;
    }
    // biome-ignore lint/suspicious/noExplicitAny: cast to satisfy the SDK return type
    return gen() as any;
  });
}

const baseInput = {
  systemPrompt: 'You are Zeno.',
  userMessage: 'oi',
  cwd: '/workspace',
  correlationId: 'test-cid',
};

beforeEach(() => vi.clearAllMocks());

describe('ClaudeCodeBackend', () => {
  it('passes prompt, systemPrompt, cwd, and allowed tools to query()', async () => {
    mockQueryStream([{ type: 'result', result: 'hi', total_cost_usd: 0.001 }]);
    const backend = new ClaudeCodeBackend();
    await backend.query(baseInput);

    expect(query).toHaveBeenCalledOnce();
    const call = vi.mocked(query).mock.calls[0][0];
    expect(call.prompt).toBe('oi');
    // Spec 0060: systemPrompt MUST be the preset+append shape so the SDK
    // injects the skill listing block from ~/.claude/skills/. A bare-string
    // systemPrompt silently drops the listing — see spec 0060 root cause.
    expect(call.options?.systemPrompt).toEqual({
      type: 'preset',
      preset: 'claude_code',
      append: 'You are Zeno.',
    });
    expect(call.options?.cwd).toBe('/workspace');
    expect(call.options?.allowedTools).toContain('Bash');
    expect(call.options?.permissionMode).toBe('bypassPermissions');
  });

  // Spec 0060: dedicated contract test guarding against regression to
  // bare-string systemPrompt. If somebody refactors and removes the
  // preset wrapper, the SDK silently stops announcing skills and the
  // agent freelances output. Lock the shape here so CI catches it.
  it('wraps systemPrompt in claude_code preset to keep skill listing visible', async () => {
    mockQueryStream([{ type: 'result', result: 'hi', total_cost_usd: 0.001 }]);
    const backend = new ClaudeCodeBackend();
    await backend.query({ ...baseInput, systemPrompt: 'CUSTOM SOUL CONTENT' });

    const call = vi.mocked(query).mock.calls[0][0];
    const sp = call.options?.systemPrompt;
    // MUST be an object with the preset shape — never a bare string.
    expect(typeof sp).toBe('object');
    expect(sp).toMatchObject({
      type: 'preset',
      preset: 'claude_code',
      append: 'CUSTOM SOUL CONTENT',
    });
  });

  it('returns text from the final result message', async () => {
    mockQueryStream([
      { type: 'system', subtype: 'init' },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'thinking...' }] } },
      { type: 'result', result: 'final answer', total_cost_usd: 0.001 },
    ]);
    const backend = new ClaudeCodeBackend();
    const output = await backend.query(baseInput);
    expect(output.text).toBe('final answer');
  });

  it('extracts sessionId from the result message', async () => {
    mockQueryStream([
      {
        type: 'result',
        result: 'done',
        session_id: 'sess_abc123',
        total_cost_usd: 0.001,
      },
    ]);
    const backend = new ClaudeCodeBackend();
    const output = await backend.query(baseInput);
    expect(output.sessionId).toBe('sess_abc123');
  });

  it('passes resume option when resumeSessionId is provided', async () => {
    mockQueryStream([
      { type: 'result', result: 'ok', session_id: 'sess_abc', total_cost_usd: 0.001 },
    ]);
    const backend = new ClaudeCodeBackend();
    await backend.query({ ...baseInput, resumeSessionId: 'sess_abc' });

    const call = vi.mocked(query).mock.calls[0][0];
    expect(call.options?.resume).toBe('sess_abc');
    expect(call.options?.persistSession).toBeUndefined();
  });

  it('passes persistSession: false when explicitly disabled', async () => {
    mockQueryStream([{ type: 'result', result: 'ok', total_cost_usd: 0.001 }]);
    const backend = new ClaudeCodeBackend();
    await backend.query({ ...baseInput, persistSession: false });

    const call = vi.mocked(query).mock.calls[0][0];
    expect(call.options?.persistSession).toBe(false);
    expect(call.options?.resume).toBeUndefined();
  });

  it('does not pass persistSession or resume when neither is set (SDK default applies)', async () => {
    mockQueryStream([{ type: 'result', result: 'ok', total_cost_usd: 0.001 }]);
    const backend = new ClaudeCodeBackend();
    await backend.query(baseInput);

    const call = vi.mocked(query).mock.calls[0][0];
    expect(call.options?.persistSession).toBeUndefined();
    expect(call.options?.resume).toBeUndefined();
  });

  it('captures tool_use blocks as toolCalls for logging', async () => {
    mockQueryStream([
      {
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', name: 'Bash', input: { command: 'gh repo list' } }],
        },
      },
      { type: 'result', result: 'done', total_cost_usd: 0.001 },
    ]);
    const backend = new ClaudeCodeBackend();
    const output = await backend.query(baseInput);
    expect(output.toolCalls).toHaveLength(1);
    expect(output.toolCalls[0].tool).toBe('Bash');
    expect(output.toolCalls[0].input).toEqual({ command: 'gh repo list' });
  });

  it('classifies auth_expired when the SDK throws an auth-related error', async () => {
    mockQueryThrow(new Error('Authentication failed: CLAUDE_CODE_OAUTH_TOKEN invalid'));
    const backend = new ClaudeCodeBackend();
    await expect(backend.query(baseInput)).rejects.toMatchObject({
      name: 'AgentBackendError',
      kind: 'auth_expired',
    });
  });

  it('classifies rate_limited on usage-limit errors', async () => {
    mockQueryThrow(new Error('Rate limit exceeded: monthly usage cap'));
    const backend = new ClaudeCodeBackend();
    await expect(backend.query(baseInput)).rejects.toMatchObject({ kind: 'rate_limited' });
  });

  it('wraps anything else as kind=unknown', async () => {
    mockQueryThrow(new Error('something weird'));
    const backend = new ClaudeCodeBackend();
    await expect(backend.query(baseInput)).rejects.toMatchObject({ kind: 'unknown' });
  });
});
