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
  // Wipe env vars left by the tests
  delete process.env.GH_TOKEN;
  delete process.env.GITHUB_TOKEN_ACME;
  delete process.env.GITHUB_TOKEN_ACME_NEW;
  delete process.env.GITHUB_TOKEN_BETA;
  delete process.env.GITHUB_TOKEN_GAMMA;
});

describe('GitHubAppAuth mutations', () => {
  describe('addInstallation', () => {
    it('appends + mints initial token + sets env var', async () => {
      const auth = new GitHubAppAuth({
        appId: '1',
        privateKey: newPem(),
        installations: [],
        disableAutoRefresh: true,
      });
      await auth.addInstallation({ name: 'Acme', id: '100', envVar: 'GITHUB_TOKEN_ACME' });
      expect(auth.getInstallationNames()).toEqual(['Acme']);
      expect(auth.getCachedToken('Acme')).toBe('tok-100');
      expect(process.env.GITHUB_TOKEN_ACME).toBe('tok-100');
    });

    it('does not throw when initial mint fails (records the install anyway)', async () => {
      const auth = new GitHubAppAuth({
        appId: '1',
        privateKey: newPem(),
        installations: [],
        disableAutoRefresh: true,
      });
      // installation id 999 → fakeError(404)
      await expect(
        auth.addInstallation({ name: 'Bad', id: '999', envVar: 'GITHUB_TOKEN_BAD' }),
      ).resolves.not.toThrow();
      expect(auth.getInstallationNames()).toEqual(['Bad']);
      expect(auth.getCachedToken('Bad')).toBeNull();
    });
  });

  describe('removeInstallation', () => {
    it('drops cache + unsets env var + removes installation entry', async () => {
      const auth = new GitHubAppAuth({
        appId: '1',
        privateKey: newPem(),
        installations: [{ name: 'Acme', id: '100', envVar: 'GITHUB_TOKEN_ACME' }],
        disableAutoRefresh: true,
      });
      await auth.bootstrap();
      expect(auth.getCachedToken('Acme')).toBe('tok-100');

      auth.removeInstallation('Acme');
      expect(auth.getInstallationNames()).toEqual([]);
      expect(auth.getCachedToken('Acme')).toBeNull();
      expect(process.env.GITHUB_TOKEN_ACME).toBeUndefined();
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

  describe('renameInstallation', () => {
    it('preserves cached token when changing name + env var', async () => {
      const auth = new GitHubAppAuth({
        appId: '1',
        privateKey: newPem(),
        installations: [{ name: 'Acme', id: '100', envVar: 'GITHUB_TOKEN_ACME' }],
        disableAutoRefresh: true,
      });
      await auth.bootstrap();
      expect(auth.getCachedToken('Acme')).toBe('tok-100');

      auth.renameInstallation({
        oldName: 'Acme',
        newName: 'Acme New',
        oldEnvVar: 'GITHUB_TOKEN_ACME',
        newEnvVar: 'GITHUB_TOKEN_ACME_NEW',
      });

      expect(auth.getCachedToken('Acme')).toBeNull();
      expect(auth.getCachedToken('Acme New')).toBe('tok-100');
      expect(auth.getInstallationNames()).toEqual(['Acme New']);
      expect(process.env.GITHUB_TOKEN_ACME).toBeUndefined();
      expect(process.env.GITHUB_TOKEN_ACME_NEW).toBe('tok-100');
    });

    it('handles env-var only change (same name)', async () => {
      const auth = new GitHubAppAuth({
        appId: '1',
        privateKey: newPem(),
        installations: [{ name: 'Acme', id: '100', envVar: 'GITHUB_TOKEN_ACME' }],
        disableAutoRefresh: true,
      });
      await auth.bootstrap();
      auth.renameInstallation({
        oldName: 'Acme',
        newName: 'Acme',
        oldEnvVar: 'GITHUB_TOKEN_ACME',
        newEnvVar: 'GITHUB_TOKEN_ACME_NEW',
      });
      expect(auth.getCachedToken('Acme')).toBe('tok-100');
      expect(process.env.GITHUB_TOKEN_ACME).toBeUndefined();
      expect(process.env.GITHUB_TOKEN_ACME_NEW).toBe('tok-100');
    });

    it('is a no-op when name is unknown', () => {
      const auth = new GitHubAppAuth({
        appId: '1',
        privateKey: newPem(),
        installations: [],
        disableAutoRefresh: true,
      });
      expect(() =>
        auth.renameInstallation({
          oldName: 'GhostRider',
          newName: 'X',
          oldEnvVar: 'A',
          newEnvVar: 'B',
        }),
      ).not.toThrow();
    });
  });

  describe('rotatePem', () => {
    it('invalidates ALL caches and re-mints', async () => {
      const auth = new GitHubAppAuth({
        appId: '1',
        privateKey: newPem(),
        installations: [
          { name: 'Acme', id: '100', envVar: 'GITHUB_TOKEN_ACME' },
          { name: 'Beta', id: '200', envVar: 'GITHUB_TOKEN_BETA' },
        ],
        disableAutoRefresh: true,
      });
      await auth.bootstrap();
      expect(auth.getCachedToken('Acme')).toBe('tok-100');
      expect(auth.getCachedToken('Beta')).toBe('tok-200');

      const newPemKey = newPem();
      await auth.rotatePem(newPemKey);
      // Both caches should still be valid (re-minted)
      expect(auth.getCachedToken('Acme')).toBe('tok-100');
      expect(auth.getCachedToken('Beta')).toBe('tok-200');
      // Env vars updated
      expect(process.env.GITHUB_TOKEN_ACME).toBe('tok-100');
      expect(process.env.GITHUB_TOKEN_BETA).toBe('tok-200');
    });
  });

  describe('appUninstall', () => {
    it('clears caches, env vars, and installation entries', async () => {
      const auth = new GitHubAppAuth({
        appId: '1',
        privateKey: newPem(),
        installations: [
          { name: 'Acme', id: '100', envVar: 'GITHUB_TOKEN_ACME' },
          { name: 'Beta', id: '200', envVar: 'GITHUB_TOKEN_BETA' },
        ],
        disableAutoRefresh: true,
      });
      await auth.bootstrap();
      auth.appUninstall();
      expect(auth.getInstallationNames()).toEqual([]);
      expect(auth.getCachedToken('Acme')).toBeNull();
      expect(auth.getCachedToken('Beta')).toBeNull();
      expect(process.env.GITHUB_TOKEN_ACME).toBeUndefined();
      expect(process.env.GITHUB_TOKEN_BETA).toBeUndefined();
      expect(process.env.GH_TOKEN).toBeUndefined();
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
