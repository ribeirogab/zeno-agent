import { describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch, csrfHeaders } from '@/lib/api-client';

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

  it('attaches X-CSRF-Token header on POST when zeno_csrf cookie is set', async () => {
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => 'zeno_csrf=abc123; other=foo',
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/api/test', { method: 'POST' });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['X-CSRF-Token']).toBe('abc123');
  });

  it('does not attach X-CSRF-Token on GET', async () => {
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => 'zeno_csrf=abc123',
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/api/test');

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['X-CSRF-Token']).toBeUndefined();
  });
});

describe('csrfHeaders', () => {
  it('returns X-CSRF-Token for mutating methods when cookie is set', () => {
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => 'zeno_csrf=tok-1',
    });
    expect(csrfHeaders('POST')).toEqual({ 'X-CSRF-Token': 'tok-1' });
    expect(csrfHeaders('put')).toEqual({ 'X-CSRF-Token': 'tok-1' });
    expect(csrfHeaders('PATCH')).toEqual({ 'X-CSRF-Token': 'tok-1' });
    expect(csrfHeaders('DELETE')).toEqual({ 'X-CSRF-Token': 'tok-1' });
  });

  it('returns empty object for safe methods', () => {
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => 'zeno_csrf=tok-1',
    });
    expect(csrfHeaders('GET')).toEqual({});
    expect(csrfHeaders('HEAD')).toEqual({});
  });

  it('returns empty object when cookie is missing', () => {
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => 'other=foo',
    });
    expect(csrfHeaders('POST')).toEqual({});
  });
});
