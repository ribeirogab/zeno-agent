import { describe, expect, it, vi } from 'vitest';
import { runTestStrategy } from '../../src/lib/channel-test-strategies.js';

describe('runTestStrategy (spec 2026-05-11)', () => {
  it('slack_auth_test returns passed when Slack auth.test returns ok:true', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const result = await runTestStrategy('slack_auth_test', {
      fields: { SLACK_BOT_TOKEN: 'xoxb-x' },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.status).toBe('passed');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://slack.com/api/auth.test',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer xoxb-x' },
      }),
    );
  });

  it('slack_auth_test returns failed/auth_failed when Slack returns ok:false', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: false, error: 'invalid_auth' }), { status: 200 }),
      );
    const result = await runTestStrategy('slack_auth_test', {
      fields: { SLACK_BOT_TOKEN: 'xoxb-bad' },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toMatchObject({ status: 'failed', error: 'auth_failed' });
  });

  it('slack_auth_test returns failed/auth_failed when bot token is missing', async () => {
    const result = await runTestStrategy('slack_auth_test', { fields: {} });
    expect(result).toMatchObject({ status: 'failed', error: 'auth_failed' });
  });

  it('slack_auth_test returns failed/network when fetch throws', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('socket hang up'));
    const result = await runTestStrategy('slack_auth_test', {
      fields: { SLACK_BOT_TOKEN: 'xoxb-x' },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toMatchObject({ status: 'failed', error: 'network' });
  });

  it('returns failed/not_implemented for unknown strategy', async () => {
    const result = await runTestStrategy('nope_strategy', { fields: {} });
    expect(result).toMatchObject({ status: 'failed', error: 'not_implemented' });
  });

  it('returns failed/timeout when probe exceeds 5s', async () => {
    const fetchImpl = vi.fn(() => new Promise(() => {})); // never resolves
    const start = Date.now();
    const result = await runTestStrategy('slack_auth_test', {
      fields: { SLACK_BOT_TOKEN: 'xoxb-x' },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const elapsed = Date.now() - start;
    expect(result).toMatchObject({ status: 'failed', error: 'timeout' });
    // Tolerate up to ~150ms scheduler slack on slow CI runners.
    expect(elapsed).toBeGreaterThanOrEqual(5000);
    expect(elapsed).toBeLessThan(5500);
  }, 10_000);
});
