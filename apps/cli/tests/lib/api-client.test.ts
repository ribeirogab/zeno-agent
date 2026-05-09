import { describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError } from '@/lib/api-client.js';

describe('ApiClient', () => {
  it('GETs a JSON resource', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const client = new ApiClient({ baseUrl: 'http://127.0.0.1:6101', fetchImpl: fetchMock });
    const result = await client.get<{ ok: boolean }>('/api/connectors');
    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:6101/api/connectors',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('POSTs JSON with CSRF token from cookie + header', async () => {
    const fetchMock = vi
      .fn()
      // First call: GET /api/health to acquire CSRF cookie
      .mockResolvedValueOnce(
        new Response('{}', {
          status: 200,
          headers: { 'set-cookie': 'zeno_csrf=abc123; Path=/' },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = new ApiClient({ baseUrl: 'http://127.0.0.1:6101', fetchImpl: fetchMock });
    await client.post('/api/connectors', { source: 'catalog', catalogId: 'linear', secrets: [] });
    const second = fetchMock.mock.calls[1]![1];
    expect(second.headers['x-csrf-token']).toBe('abc123');
    expect(second.headers.cookie).toContain('zeno_csrf=abc123');
  });

  it('throws ApiError on non-2xx with parsed body', async () => {
    const fetchMock = vi
      .fn()
      // GET /api/health to acquire CSRF cookie before the mutation
      .mockResolvedValueOnce(
        new Response('{}', {
          status: 200,
          headers: { 'set-cookie': 'zeno_csrf=abc123; Path=/' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: 'mode_cli_only', cli: 'zeno connector install <catalog-id>' }),
          { status: 403, headers: { 'content-type': 'application/json' } },
        ),
      );
    const client = new ApiClient({ baseUrl: 'http://127.0.0.1:6101', fetchImpl: fetchMock });
    await expect(client.post('/api/connectors', {})).rejects.toThrow(ApiError);
  });
});
