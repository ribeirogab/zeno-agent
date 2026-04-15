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
    expect(call.options?.systemPrompt).toBe('You are Zeno.');
    expect(call.options?.cwd).toBe('/workspace');
    expect(call.options?.allowedTools).toContain('Bash');
    expect(call.options?.permissionMode).toBe('bypassPermissions');
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
