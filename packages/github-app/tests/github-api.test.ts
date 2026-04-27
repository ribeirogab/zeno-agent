import { describe, expect, it, vi } from 'vitest';
import {
  type FetchLike,
  fetchAppMetadata,
  fetchInstallationRepoCount,
  fetchInstallations,
  GitHubAppError,
  mintInstallationToken,
} from '../src/index.js';

function ok<T>(body: T, headers?: Record<string, string>): Awaited<ReturnType<FetchLike>> {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
    json: async () => body as unknown,
    headers: {
      get: (name: string) => headers?.[name.toLowerCase()] ?? null,
    },
  } as Awaited<ReturnType<FetchLike>> & { headers: { get(name: string): string | null } };
}

function err(status: number, body: string): Awaited<ReturnType<FetchLike>> {
  return {
    ok: false,
    status,
    text: async () => body,
    json: async () => ({}) as unknown,
  };
}

describe('fetchAppMetadata', () => {
  it('returns appId/slug/name on 200', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(ok({ id: 12345, slug: 'acme-bot', name: 'Acme Bot' }));
    const out = await fetchAppMetadata('jwt-x', { fetch: fetchImpl as FetchLike });
    expect(out).toEqual({ appId: '12345', slug: 'acme-bot', name: 'Acme Bot' });
    expect(fetchImpl).toHaveBeenCalledWith('https://api.github.com/app', {
      method: 'GET',
      headers: expect.objectContaining({ Authorization: 'Bearer jwt-x' }),
    });
  });

  it('throws GitHubAppError(kind=auth) on 401', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(err(401, '{"message":"Bad credentials"}'));
    await expect(fetchAppMetadata('bad', { fetch: fetchImpl as FetchLike })).rejects.toMatchObject({
      kind: 'auth',
      status: 401,
    });
  });

  it('throws GitHubAppError(kind=auth) on 403', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(err(403, '{"message":"Forbidden"}'));
    await expect(fetchAppMetadata('jwt', { fetch: fetchImpl as FetchLike })).rejects.toMatchObject({
      kind: 'auth',
    });
  });

  it('throws GitHubAppError(kind=network) when fetch throws', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(fetchAppMetadata('jwt', { fetch: fetchImpl as FetchLike })).rejects.toMatchObject({
      kind: 'network',
      status: null,
    });
  });

  it('truncates long error bodies to 500 chars', async () => {
    const long = 'x'.repeat(2000);
    const fetchImpl = vi.fn().mockResolvedValue(err(500, long));
    let caught: unknown;
    try {
      await fetchAppMetadata('jwt', { fetch: fetchImpl as FetchLike });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(GitHubAppError);
    const msg = (caught as GitHubAppError).message;
    expect(msg.length).toBeLessThan(600);
  });
});

describe('fetchInstallations', () => {
  it('parses installation list', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      ok([
        {
          id: 100,
          account: { login: 'acme', type: 'Organization' },
          permissions: { contents: 'read', issues: 'write' },
          repository_selection: 'selected',
        },
        {
          id: 200,
          account: { login: 'operator', type: 'User' },
          permissions: { contents: 'read' },
          repository_selection: 'all',
        },
      ]),
    );
    const out = await fetchInstallations('jwt', { fetch: fetchImpl as FetchLike });
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      id: '100',
      account: 'acme',
      accountType: 'Organization',
      repoCount: 0, // 'selected' → 0 placeholder; real count via fetchInstallationRepoCount
      permissions: { contents: 'read', issues: 'write' },
    });
    expect(out[1]?.repoCount).toBeNull(); // 'all' → null
  });

  it('handles missing account gracefully', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      ok([
        {
          id: 1,
          account: null,
          permissions: {},
          repository_selection: 'all',
        },
      ]),
    );
    const out = await fetchInstallations('jwt', { fetch: fetchImpl as FetchLike });
    expect(out[0]?.account).toBe('');
    expect(out[0]?.accountType).toBe('');
  });

  it('follows Link: rel="next" pagination up to 10 pages', async () => {
    const page1 = ok(
      [
        {
          id: 1,
          account: { login: 'a', type: 'User' },
          permissions: {},
          repository_selection: 'all',
        },
      ],
      {
        link: '<https://api.github.com/app/installations?page=2&per_page=100>; rel="next"',
      },
    );
    const page2 = ok([
      {
        id: 2,
        account: { login: 'b', type: 'User' },
        permissions: {},
        repository_selection: 'all',
      },
    ]);
    const fetchImpl = vi.fn().mockResolvedValueOnce(page1).mockResolvedValueOnce(page2);
    const out = await fetchInstallations('jwt', { fetch: fetchImpl as FetchLike });
    expect(out.map((i) => i.id)).toEqual(['1', '2']);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('classifies 401 as auth', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(err(401, 'unauth'));
    await expect(
      fetchInstallations('jwt', { fetch: fetchImpl as FetchLike }),
    ).rejects.toMatchObject({
      kind: 'auth',
    });
  });
});

describe('mintInstallationToken', () => {
  it('returns token + expiresAt on 201', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(ok({ token: 'ghs_secret', expires_at: '2026-01-01T00:00:00Z' }));
    const out = await mintInstallationToken('jwt', '999', { fetch: fetchImpl as FetchLike });
    expect(out).toEqual({ token: 'ghs_secret', expiresAt: '2026-01-01T00:00:00Z' });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.github.com/app/installations/999/access_tokens',
      {
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer jwt' }),
      },
    );
  });

  it('throws not_found on 404 (installation revoked)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(err(404, 'gone'));
    await expect(
      mintInstallationToken('jwt', '999', { fetch: fetchImpl as FetchLike }),
    ).rejects.toMatchObject({
      kind: 'not_found',
    });
  });

  it('throws rate_limit on 429', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(err(429, 'too many'));
    await expect(
      mintInstallationToken('jwt', '999', { fetch: fetchImpl as FetchLike }),
    ).rejects.toMatchObject({
      kind: 'rate_limit',
    });
  });
});

describe('fetchInstallationRepoCount', () => {
  it('returns total_count from header endpoint', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ total_count: 7, repositories: [] }));
    const n = await fetchInstallationRepoCount('ghs_secret', { fetch: fetchImpl as FetchLike });
    expect(n).toBe(7);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.github.com/installation/repositories?per_page=1',
      { method: 'GET', headers: expect.objectContaining({ Authorization: 'Bearer ghs_secret' }) },
    );
  });
});
