import { describe, expect, it, vi } from 'vitest';
import { waitForCommand } from '@/lib/wait-command.js';

describe('waitForCommand', () => {
  it('polls until status is terminal', async () => {
    const client = {
      get: vi
        .fn()
        .mockResolvedValueOnce({ status: 'pending' })
        .mockResolvedValueOnce({ status: 'processing' })
        .mockResolvedValueOnce({ status: 'success', result: '{}' }),
    };
    const result = await waitForCommand(client as any, 'corr-1', {
      intervalMs: 1,
      timeoutMs: 1000,
    });
    expect(result.status).toBe('success');
    expect(client.get).toHaveBeenCalledTimes(3);
  });

  it('throws on timeout', async () => {
    const client = { get: vi.fn().mockResolvedValue({ status: 'pending' }) };
    await expect(
      waitForCommand(client as any, 'corr-1', { intervalMs: 1, timeoutMs: 5 }),
    ).rejects.toThrow(/timeout/);
  });
});
