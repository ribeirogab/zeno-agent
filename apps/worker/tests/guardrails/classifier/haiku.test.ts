import type { Query, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({ query: vi.fn() }));

import { query } from '@anthropic-ai/claude-agent-sdk';
import { HaikuClassifier, parseClassifierOutput } from '@/guardrails/classifier/haiku';

function mockResult(text: string): void {
  vi.mocked(query).mockImplementation(() => {
    async function* gen(): AsyncGenerator<SDKMessage, void> {
      yield {
        type: 'result',
        result: text,
        total_cost_usd: 0,
      } as unknown as SDKMessage;
    }
    return gen() as unknown as Query;
  });
}

beforeEach(() => vi.clearAllMocks());

describe('parseClassifierOutput', () => {
  it('parses bare JSON', () => {
    expect(parseClassifierOutput('{"sensitive": true, "reason": "writes to disk"}')).toEqual({
      sensitive: true,
      reason: 'writes to disk',
    });
  });

  it('strips ```json fences', () => {
    const fenced = '```json\n{"sensitive": false, "reason": "read-only"}\n```';
    expect(parseClassifierOutput(fenced)).toEqual({
      sensitive: false,
      reason: 'read-only',
    });
  });

  it('throws on malformed JSON', () => {
    expect(() => parseClassifierOutput('not json at all')).toThrow();
  });

  it('throws on schema mismatch', () => {
    expect(() => parseClassifierOutput('{"sensitive": "yes", "reason": "x"}')).toThrow();
  });
});

describe('HaikuClassifier.classify', () => {
  it('returns the parsed result on a sensitive call', async () => {
    mockResult('{"sensitive": true, "reason": "deploys to staging"}');
    const classifier = new HaikuClassifier({ model: 'claude-haiku-4-5' });

    const result = await classifier.classify('Bash', { command: './deploy.sh' });

    expect(result).toEqual({ sensitive: true, reason: 'deploys to staging' });
    expect(query).toHaveBeenCalledOnce();
    const call = vi.mocked(query).mock.calls[0][0];
    expect(call.options?.allowedTools).toEqual([]);
    expect(call.options?.model).toBe('claude-haiku-4-5');
  });

  it('returns the parsed result on a safe call', async () => {
    mockResult('{"sensitive": false, "reason": "read-only git command"}');
    const classifier = new HaikuClassifier({ model: 'claude-haiku-4-5' });

    const result = await classifier.classify('Bash', { command: 'git log -1' });

    expect(result).toEqual({ sensitive: false, reason: 'read-only git command' });
  });

  it('parses fenced JSON output from the model', async () => {
    mockResult('```json\n{"sensitive": true, "reason": "merges PRs"}\n```');
    const classifier = new HaikuClassifier({ model: 'claude-haiku-4-5' });

    const result = await classifier.classify('mcp__github__merge_pull_request', { pr: 42 });

    expect(result).toEqual({ sensitive: true, reason: 'merges PRs' });
  });

  it('throws when the model output is malformed', async () => {
    mockResult('lol I am not JSON');
    const classifier = new HaikuClassifier({ model: 'claude-haiku-4-5' });

    await expect(classifier.classify('Bash', {})).rejects.toThrow();
  });
});
