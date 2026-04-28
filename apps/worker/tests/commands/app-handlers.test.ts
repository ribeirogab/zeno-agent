/**
 * Unit tests for the 2 GitHub App lifecycle handlers (spec 0044, spec 0051
 * retired the rotate-PEM handler).
 *
 * The handlers themselves are thin shells around the GitHubAppAuth singleton
 * and the connectorApps repo. These tests use fakes for both — they verify
 * the wiring (right deps, right method calls) without exercising fetch.
 */

import { describe, expect, it, vi } from 'vitest';
import { buildAppInstallHandler } from '@/commands/handlers/app-install';
import { buildAppUninstallHandler } from '@/commands/handlers/app-uninstall';
import type { GitHubAppAuth } from '@/github/app-auth';

function makeFakeGithubApp(): GitHubAppAuth {
  return {
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

// Spec 0051: app_pem_rotated handler tests removed alongside the feature.

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

  // Spec 0050 dropped the auto-rule cascade (the R1 F1 tests from batch-2)
  // alongside the rest of the approval-rules infrastructure. The SQLite
  // cascade on connectors.app_id still wipes the github-app-* connectors
  // atomically; nothing else needs cleanup.
});
