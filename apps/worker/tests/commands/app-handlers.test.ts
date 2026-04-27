/**
 * Unit tests for the 3 GitHub App lifecycle handlers. Spec 0044.
 *
 * The handlers themselves are thin shells around the GitHubAppAuth singleton
 * and the connectorApps repo. These tests use fakes for both — they verify
 * the wiring (right deps, right method calls) without exercising fetch.
 */

import { describe, expect, it, vi } from 'vitest';
import { buildAppInstallHandler } from '@/commands/handlers/app-install';
import { buildAppPemRotatedHandler } from '@/commands/handlers/app-pem-rotated';
import { buildAppUninstallHandler } from '@/commands/handlers/app-uninstall';
import type { GitHubAppAuth } from '@/github/app-auth';

function makeFakeGithubApp(): GitHubAppAuth {
  return {
    rotatePem: vi.fn(async () => undefined),
    appUninstall: vi.fn(),
    getAppId: vi.fn(() => '12345'),
    getCachedToken: vi.fn(() => null),
    invalidateCache: vi.fn(),
    getToken: vi.fn(),
    getInstallationNames: vi.fn(() => []),
    bootstrap: vi.fn(),
    stop: vi.fn(),
    addInstallation: vi.fn(),
    removeInstallation: vi.fn(),
    renameInstallation: vi.fn(),
  } as unknown as GitHubAppAuth;
}

function fakeCommand(type: string, payload: object) {
  return {
    id: 'cmd-1',
    type,
    payload: JSON.stringify(payload),
    status: 'pending' as const,
    createdAt: '',
    processedAt: null,
    completedAt: null,
    result: null,
    correlationId: 'corr-1',
  };
}

describe('app_install handler', () => {
  it('no-ops when singleton already exists', async () => {
    const githubApp = makeFakeGithubApp();
    const bootstrap = vi.fn(async () => githubApp);
    const handler = buildAppInstallHandler({
      getGithubApp: () => githubApp,
      bootstrapGithubApp: bootstrap,
    });
    const res = await handler(fakeCommand('app_install', { appUuid: 'a-1' }));
    expect(res).toEqual({ ok: true, data: { bootstrapped: false } });
    expect(bootstrap).not.toHaveBeenCalled();
  });

  it('bootstraps when singleton is null', async () => {
    const githubApp = makeFakeGithubApp();
    const bootstrap = vi.fn(async () => githubApp);
    const handler = buildAppInstallHandler({
      getGithubApp: () => null,
      bootstrapGithubApp: bootstrap,
    });
    const res = await handler(fakeCommand('app_install', { appUuid: 'a-1' }));
    expect(res).toEqual({ ok: true, data: { bootstrapped: true } });
    expect(bootstrap).toHaveBeenCalledTimes(1);
  });

  it('returns error if bootstrap returns null', async () => {
    const handler = buildAppInstallHandler({
      getGithubApp: () => null,
      bootstrapGithubApp: async () => null,
    });
    const res = await handler(fakeCommand('app_install', { appUuid: 'a-1' }));
    expect(res.ok).toBe(false);
  });
});

describe('app_pem_rotated handler', () => {
  it('reads PEM from DB and calls rotatePem', async () => {
    const githubApp = makeFakeGithubApp();
    const connectorApps = {
      get: vi.fn(() => ({
        id: 'a-1',
        catalogId: 'github-app',
        appId: '12345',
        appSlug: 'zen',
        appName: 'Zen',
        pem: '-----BEGIN PRIVATE KEY-----\nNEW\n-----END PRIVATE KEY-----',
        pemSha256: 'sha',
        pemRotatedAt: null,
        createdAt: '',
        updatedAt: '',
      })),
    } as unknown as Parameters<typeof buildAppPemRotatedHandler>[0]['connectorApps'];
    const handler = buildAppPemRotatedHandler({
      getGithubApp: () => githubApp,
      connectorApps,
    });
    const res = await handler(fakeCommand('app_pem_rotated', { appUuid: 'a-1' }));
    expect(res).toEqual({ ok: true });
    expect(githubApp.rotatePem).toHaveBeenCalledWith(
      '-----BEGIN PRIVATE KEY-----\nNEW\n-----END PRIVATE KEY-----',
    );
  });

  it('returns error when singleton is null', async () => {
    const handler = buildAppPemRotatedHandler({
      getGithubApp: () => null,
      connectorApps: { get: vi.fn() } as unknown as Parameters<
        typeof buildAppPemRotatedHandler
      >[0]['connectorApps'],
    });
    const res = await handler(fakeCommand('app_pem_rotated', { appUuid: 'a-1' }));
    expect(res.ok).toBe(false);
  });

  it('returns error when DB row is missing', async () => {
    const githubApp = makeFakeGithubApp();
    const handler = buildAppPemRotatedHandler({
      getGithubApp: () => githubApp,
      connectorApps: { get: vi.fn(() => null) } as unknown as Parameters<
        typeof buildAppPemRotatedHandler
      >[0]['connectorApps'],
    });
    const res = await handler(fakeCommand('app_pem_rotated', { appUuid: 'a-1' }));
    expect(res.ok).toBe(false);
  });
});

describe('app_uninstall handler', () => {
  it('calls tearDown when singleton exists', async () => {
    const githubApp = makeFakeGithubApp();
    const tearDown = vi.fn();
    const handler = buildAppUninstallHandler({
      getGithubApp: () => githubApp,
      tearDownGithubApp: tearDown,
    });
    const res = await handler(fakeCommand('app_uninstall', { appUuid: 'a-1' }));
    expect(res).toEqual({ ok: true });
    expect(tearDown).toHaveBeenCalledTimes(1);
  });

  it('is idempotent when singleton is null', async () => {
    const tearDown = vi.fn();
    const handler = buildAppUninstallHandler({
      getGithubApp: () => null,
      tearDownGithubApp: tearDown,
    });
    const res = await handler(fakeCommand('app_uninstall', { appUuid: 'a-1' }));
    expect(res.ok).toBe(true);
    expect(tearDown).not.toHaveBeenCalled();
  });
});
