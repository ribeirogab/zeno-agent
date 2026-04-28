/**
 * Surgical mutation tests for GitHubAppAuth. Spec 0044.
 *
 * We override the global `fetch` for the duration of the test to fake the
 * GitHub access-tokens endpoint. The class is constructed with
 * `disableAutoRefresh: true` so the refresh interval doesn't fire.
 */

import { generateKeyPairSync } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GitHubAppAuth } from '@/github/app-auth';

function newPem(): string {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return privateKey;
}

function fakeMintResponse(token: string, expiresInMs = 60 * 60_000) {
  return {
    ok: true,
    status: 200,
    text: async () => '',
    json: async () => ({
      token,
      expires_at: new Date(Date.now() + expiresInMs).toISOString(),
    }),
  };
}

function fakeError(status: number) {
  return {
    ok: false,
    status,
    text: async () => 'fake error',
    json: async () => ({}),
  };
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation((async (url: string) => {
    if (typeof url !== 'string') throw new Error('expected URL string');
    if (url.includes('/installations/100/access_tokens')) return fakeMintResponse('tok-100');
    if (url.includes('/installations/200/access_tokens')) return fakeMintResponse('tok-200');
    if (url.includes('/installations/300/access_tokens')) return fakeMintResponse('tok-300');
    if (url.includes('/installations/999/access_tokens')) return fakeError(404);
    throw new Error(`unexpected fetch URL: ${url}`);
  }) as unknown as typeof fetch);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('GitHubAppAuth mutations', () => {
  describe('addInstallation', () => {
    it('appends + mints initial token', async () => {
      const auth = new GitHubAppAuth({
        appId: '1',
        privateKey: newPem(),
        installations: [],
        disableAutoRefresh: true,
      });
      await auth.addInstallation({ name: 'Acme', id: '100' });
      expect(auth.getInstallationNames()).toEqual(['Acme']);
      expect(auth.getCachedToken('Acme')).toBe('tok-100');
    });

    it('does not throw when initial mint fails (records the install anyway)', async () => {
      const auth = new GitHubAppAuth({
        appId: '1',
        privateKey: newPem(),
        installations: [],
        disableAutoRefresh: true,
      });
      // installation id 999 → fakeError(404)
      await expect(auth.addInstallation({ name: 'Bad', id: '999' })).resolves.not.toThrow();
      expect(auth.getInstallationNames()).toEqual(['Bad']);
      expect(auth.getCachedToken('Bad')).toBeNull();
    });
  });

  describe('removeInstallation', () => {
    it('drops cache + removes installation entry', async () => {
      const auth = new GitHubAppAuth({
        appId: '1',
        privateKey: newPem(),
        installations: [{ name: 'Acme', id: '100' }],
        disableAutoRefresh: true,
      });
      await auth.bootstrap();
      expect(auth.getCachedToken('Acme')).toBe('tok-100');

      auth.removeInstallation('Acme');
      expect(auth.getInstallationNames()).toEqual([]);
      expect(auth.getCachedToken('Acme')).toBeNull();
    });

    it('is a no-op for unknown names', () => {
      const auth = new GitHubAppAuth({
        appId: '1',
        privateKey: newPem(),
        installations: [],
        disableAutoRefresh: true,
      });
      expect(() => auth.removeInstallation('GhostRider')).not.toThrow();
    });
  });

  // Spec 0051: renameInstallation + rotatePem describe blocks removed
  // alongside the features.

  describe('appUninstall', () => {
    it('clears caches and installation entries', async () => {
      const auth = new GitHubAppAuth({
        appId: '1',
        privateKey: newPem(),
        installations: [
          { name: 'Acme', id: '100' },
          { name: 'Beta', id: '200' },
        ],
        disableAutoRefresh: true,
      });
      await auth.bootstrap();
      auth.appUninstall();
      expect(auth.getInstallationNames()).toEqual([]);
      expect(auth.getCachedToken('Acme')).toBeNull();
      expect(auth.getCachedToken('Beta')).toBeNull();
    });

    it('is idempotent', () => {
      const auth = new GitHubAppAuth({
        appId: '1',
        privateKey: newPem(),
        installations: [],
        disableAutoRefresh: true,
      });
      expect(() => auth.appUninstall()).not.toThrow();
      expect(() => auth.appUninstall()).not.toThrow();
    });
  });
});

/**
 * Spec 0048 Q3: per-installation exponential-backoff retry chain.
 * Backoff = [30s, 60s, 120s, 240s, 480s]. Reset to step 0 on success.
 *
 * These tests use fake timers + scripted fetch responses to drive the retry
 * path through public methods (bootstrap, removeInstallation, stop) since
 * scheduleRetry/retryInstallation are private.
 */
describe('GitHubAppAuth retry backoff (Spec 0048 Q3)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function fetchMock() {
    return globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
  }

  it('schedules retry on refresh failure and recovers after first backoff (30s)', async () => {
    let callCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation((async (url: string) => {
      callCount += 1;
      if (typeof url !== 'string') throw new Error('expected URL string');
      // First call (bootstrap refreshAll) → fail; subsequent → succeed
      return callCount === 1 ? fakeError(500) : fakeMintResponse('tok-100');
    }) as unknown as typeof fetch);

    const auth = new GitHubAppAuth({
      appId: '1',
      privateKey: newPem(),
      installations: [{ name: 'Acme', id: '100' }],
      disableAutoRefresh: false,
    });
    await auth.bootstrap();
    expect(auth.getCachedToken('Acme')).toBeNull();

    // Advance to first backoff step (30s) → retryInstallation runs → success
    await vi.advanceTimersByTimeAsync(30_000);
    expect(auth.getCachedToken('Acme')).toBe('tok-100');

    // Step is cleared on success: advancing further should NOT trigger any
    // additional retry (would require either another failure or 55min cycle).
    const callsAfterRecovery = fetchMock().mock.calls.length;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetchMock().mock.calls.length).toBe(callsAfterRecovery);
    auth.stop();
  });

  it('escalates backoff step on consecutive failures (30s → 60s)', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((async () =>
      fakeError(500)) as unknown as typeof fetch);
    const auth = new GitHubAppAuth({
      appId: '1',
      privateKey: newPem(),
      installations: [{ name: 'Acme', id: '100' }],
      disableAutoRefresh: false,
    });
    await auth.bootstrap();
    expect(fetchMock().mock.calls.length).toBe(1);

    // 30s → step 1 retry
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock().mock.calls.length).toBe(2);

    // 60s → step 2 retry (NOT 30s again — step incremented)
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock().mock.calls.length).toBe(3);

    auth.stop();
  });

  it('stop() clears every pending retry timer', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((async () =>
      fakeError(500)) as unknown as typeof fetch);
    const auth = new GitHubAppAuth({
      appId: '1',
      privateKey: newPem(),
      installations: [
        { name: 'Acme', id: '100' },
        { name: 'Beta', id: '200' },
      ],
      disableAutoRefresh: false,
    });
    await auth.bootstrap();
    // Both installations failed → 2 fetch calls; both retries pending
    expect(fetchMock().mock.calls.length).toBe(2);

    auth.stop();
    const callsAtStop = fetchMock().mock.calls.length;
    // Advance well past the first backoff window — no new fetches because
    // stop() cancelled both pending retries.
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetchMock().mock.calls.length).toBe(callsAtStop);
  });

  it('removeInstallation cancels the retry timer for the removed installation only', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((async () =>
      fakeError(500)) as unknown as typeof fetch);
    const auth = new GitHubAppAuth({
      appId: '1',
      privateKey: newPem(),
      installations: [
        { name: 'Acme', id: '100' },
        { name: 'Beta', id: '200' },
      ],
      disableAutoRefresh: false,
    });
    await auth.bootstrap();
    expect(fetchMock().mock.calls.length).toBe(2);

    auth.removeInstallation('Acme');
    const callsAfterRemove = fetchMock().mock.calls.length;
    // 30s later: only Beta's retry should fire (Acme cancelled).
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock().mock.calls.length).toBe(callsAfterRemove + 1);
    auth.stop();
  });

  it('caps backoff at the longest step (480s) for repeated failures beyond table length', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((async () =>
      fakeError(500)) as unknown as typeof fetch);
    const auth = new GitHubAppAuth({
      appId: '1',
      privateKey: newPem(),
      installations: [{ name: 'Acme', id: '100' }],
      disableAutoRefresh: false,
    });
    await auth.bootstrap();
    // Exhaust all 5 backoff steps: 30 + 60 + 120 + 240 + 480 = 930s
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.advanceTimersByTimeAsync(120_000);
    await vi.advanceTimersByTimeAsync(240_000);
    await vi.advanceTimersByTimeAsync(480_000);
    // 1 (bootstrap) + 5 (retries through table) = 6
    expect(fetchMock().mock.calls.length).toBe(6);
    // Past the table → cap at 480s
    await vi.advanceTimersByTimeAsync(480_000);
    expect(fetchMock().mock.calls.length).toBe(7);
    auth.stop();
  });
});
