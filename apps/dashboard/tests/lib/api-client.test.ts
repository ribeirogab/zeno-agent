import { describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch } from '@/lib/api-client';

describe('apiFetch', () => {
  it('returns parsed JSON on 200', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );
    const result = await apiFetch<{ ok: boolean }>('/api/test');
    expect(result).toEqual({ ok: true });
  });

  it('returns undefined on 204', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    const result = await apiFetch<void>('/api/test');
    expect(result).toBeUndefined();
  });

  it('throws ApiError on 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'x' }), { status: 401 })),
    );
    await expect(apiFetch('/api/test')).rejects.toBeInstanceOf(ApiError);
  });
});
