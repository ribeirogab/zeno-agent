import type { HookCallback, Query, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the SDK module BEFORE importing the unit under test
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({ query: vi.fn() }));

import { query } from '@anthropic-ai/claude-agent-sdk';
import { ClaudeCodeBackend } from '@/agent/backends/claude-code';

function mockQueryStream(messages: SDKMessage[]): void {
  vi.mocked(query).mockImplementation(() => {
    async function* gen(): AsyncGenerator<SDKMessage, void> {
      for (const message of messages) yield message;
    }
    return gen() as unknown as Query;
  });
}

const baseInput = {
  systemPrompt: 'You are Zeno.',
  userMessage: 'oi',
  cwd: '/workspace',
  correlationId: 'test-cid',
};

beforeEach(() => vi.clearAllMocks());

describe('ClaudeCodeBackend preToolUseHook wiring', () => {
  it('forwards preToolUseHook via hooks.PreToolUse and switches permissionMode to "default"', async () => {
    mockQueryStream([
      { type: 'result', result: 'ok', total_cost_usd: 0.001 } as unknown as SDKMessage,
    ]);

    const preToolUseHook: HookCallback = vi.fn(async () => ({ continue: true }));
    const backend = new ClaudeCodeBackend({ preToolUseHook });
    await backend.query(baseInput);

    expect(query).toHaveBeenCalledOnce();
    const call = vi.mocked(query).mock.calls[0][0];
    expect(call.options?.permissionMode).toBe('default');
    expect(call.options?.hooks?.PreToolUse).toHaveLength(1);
    expect(call.options?.hooks?.PreToolUse?.[0]?.hooks).toContain(preToolUseHook);
  });

  it('keeps "bypassPermissions" and omits hooks when no hook is provided', async () => {
    mockQueryStream([
      { type: 'result', result: 'ok', total_cost_usd: 0.001 } as unknown as SDKMessage,
    ]);

    const backend = new ClaudeCodeBackend();
    await backend.query(baseInput);

    const call = vi.mocked(query).mock.calls[0][0];
    expect(call.options?.permissionMode).toBe('bypassPermissions');
    expect(call.options?.hooks).toBeUndefined();
  });
});
