import { describe, expect, it, vi } from 'vitest';
import { runConnectorRefreshTools } from '@/commands/connector-refresh-tools.js';

describe('zeno connector refresh-tools', () => {
  it('POSTs /:id/refresh-tools and polls correlationId until success', async () => {
    const client = {
      get: vi
        .fn()
        // First call: connector lookup.
        .mockResolvedValueOnce({ id: 'abc' })
        // Subsequent calls: command status polls.
        .mockResolvedValue({ status: 'success', result: null }),
      post: vi.fn().mockResolvedValue({ correlationId: 'corr-7' }),
    };
    const out: string[] = [];
    await runConnectorRefreshTools(
      // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
      client as any,
      { target: 'linear-acme' },
      (line) => out.push(line),
    );
    expect(client.get).toHaveBeenCalledWith('/api/connectors/linear-acme');
    expect(client.post).toHaveBeenCalledWith('/api/connectors/abc/refresh-tools', undefined);
    expect(client.get).toHaveBeenCalledWith('/api/commands/corr-7');
    const text = out.join('\n');
    expect(text).toContain('corr-7');
    expect(text).toContain('refreshed');
  });

  it('throws when waitForCommand reports failure', async () => {
    const client = {
      get: vi
        .fn()
        .mockResolvedValueOnce({ id: 'abc' })
        .mockResolvedValue({ status: 'failed', result: 'discovery_failed' }),
      post: vi.fn().mockResolvedValue({ correlationId: 'corr-8' }),
    };
    await expect(
      runConnectorRefreshTools(
        // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
        client as any,
        { target: 'linear-acme' },
        () => {},
      ),
    ).rejects.toThrow(/refresh-tools failed: discovery_failed/);
  });
});
