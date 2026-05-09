import { describe, expect, it, vi } from 'vitest';
import { runConnectorTest } from '@/commands/connector-test.js';

describe('zeno connector test', () => {
  it('POSTs /:id/test and prints tool names + duration', async () => {
    const client = {
      get: vi.fn().mockResolvedValue({ id: 'abc' }),
      post: vi.fn().mockResolvedValue({
        ok: true,
        tools: [{ name: 'get_issue' }, { name: 'create_issue' }],
        durationMs: 142,
      }),
    };
    const out: string[] = [];
    await runConnectorTest(
      // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
      client as any,
      { target: 'linear-acme' },
      (line) => out.push(line),
    );
    expect(client.get).toHaveBeenCalledWith('/api/connectors/linear-acme');
    expect(client.post).toHaveBeenCalledWith('/api/connectors/abc/test', undefined);
    const text = out.join('\n');
    expect(text).toMatch(/passed/);
    expect(text).toMatch(/2 tools/);
    expect(text).toMatch(/142ms/);
    expect(text).toMatch(/get_issue/);
    expect(text).toMatch(/create_issue/);
  });

  it('throws when the test result reports failure', async () => {
    const client = {
      get: vi.fn().mockResolvedValue({ id: 'abc' }),
      post: vi.fn().mockResolvedValue({
        ok: false,
        errorKind: 'auth_failed',
        error: 'auth_failed',
      }),
    };
    await expect(
      runConnectorTest(
        // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
        client as any,
        { target: 'linear-acme' },
        () => {},
      ),
    ).rejects.toThrow(/test failed: auth_failed/);
  });
});
