import { describe, expect, it, vi } from 'vitest';
import { runConnectorAppInstall } from '@/commands/connector-app-install.js';
import { runConnectorAppInstallationsAdd } from '@/commands/connector-app-installations-add.js';
import { runConnectorAppInstallationsDiscover } from '@/commands/connector-app-installations-discover.js';
import { runConnectorAppUninstall } from '@/commands/connector-app-uninstall.js';

describe('zeno connector app', () => {
  describe('install', () => {
    it('reads the PEM file and POSTs /catalog/github-app/install with appId + pem', async () => {
      const client = {
        get: vi.fn(),
        post: vi.fn().mockResolvedValue({
          ok: true,
          appUuid: 'uuid-1',
          appId: '123456',
          appName: 'Acme Corp App',
          appSlug: 'acme-corp-app',
        }),
      };
      const readPem = vi
        .fn()
        .mockReturnValue('-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----');
      const out: string[] = [];
      await runConnectorAppInstall(
        // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
        client as any,
        { catalog: 'github-app', appId: '123456', pemFile: '/tmp/key.pem', readPem },
        (line) => out.push(line),
      );
      expect(readPem).toHaveBeenCalledWith('/tmp/key.pem');
      expect(client.post).toHaveBeenCalledWith(
        '/api/connectors/catalog/github-app/install',
        expect.objectContaining({
          appId: '123456',
          pem: '-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----',
        }),
      );
      const text = out.join('\n');
      expect(text).toMatch(/Acme Corp App/);
      expect(text).toMatch(/acme-corp-app/);
    });

    it('rejects unknown catalog (only github-app supported)', async () => {
      const client = { get: vi.fn(), post: vi.fn() };
      const readPem = vi.fn();
      await expect(
        runConnectorAppInstall(
          // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
          client as any,
          { catalog: 'gitlab-app', appId: '1', pemFile: '/tmp/k.pem', readPem },
          () => {},
        ),
      ).rejects.toThrow(/github-app/);
      expect(client.post).not.toHaveBeenCalled();
      expect(readPem).not.toHaveBeenCalled();
    });

    it('surfaces ok:false errors with errorKind + error', async () => {
      const client = {
        get: vi.fn(),
        post: vi.fn().mockResolvedValue({
          ok: false,
          errorKind: 'auth',
          error: 'pem could not sign a JWT',
        }),
      };
      const readPem = vi.fn().mockReturnValue('pem-bytes');
      await expect(
        runConnectorAppInstall(
          // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
          client as any,
          { catalog: 'github-app', appId: '999', pemFile: '/tmp/bad.pem', readPem },
          () => {},
        ),
      ).rejects.toThrow(/auth.*pem could not sign a JWT/);
    });
  });

  describe('installations discover', () => {
    it('POSTs /catalog/github-app/installations/discover and prints rows', async () => {
      const client = {
        get: vi.fn(),
        post: vi.fn().mockResolvedValue({
          installations: [
            {
              id: '111',
              name: 'acme',
              accountType: 'Organization',
              repoCount: 12,
              permissions: {},
              alreadyWired: false,
            },
            {
              id: '222',
              name: 'gabriel',
              accountType: 'User',
              repoCount: 3,
              permissions: {},
              alreadyWired: true,
            },
          ],
        }),
      };
      const out: string[] = [];
      await runConnectorAppInstallationsDiscover(
        // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
        client as any,
        {},
        (line) => out.push(line),
      );
      expect(client.post).toHaveBeenCalledWith(
        '/api/connectors/catalog/github-app/installations/discover',
        {},
      );
      const text = out.join('\n');
      expect(text).toMatch(/111/);
      expect(text).toMatch(/acme/);
      expect(text).toMatch(/Organization/);
      expect(text).toMatch(/12 repos/);
      expect(text).toMatch(/available/);
      expect(text).toMatch(/222/);
      expect(text).toMatch(/gabriel/);
      expect(text).toMatch(/User/);
      expect(text).toMatch(/wired/);
    });
  });

  describe('installations add', () => {
    it('POSTs /catalog/github-app/installations and waits for the command', async () => {
      const client = {
        get: vi.fn().mockResolvedValue({ status: 'success', result: null }),
        post: vi.fn().mockResolvedValue({ correlationId: 'corr-add', slug: 'github-app-acme' }),
      };
      const out: string[] = [];
      await runConnectorAppInstallationsAdd(
        // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
        client as any,
        { installationId: '111', label: 'Acme Books' },
        (line) => out.push(line),
      );
      expect(client.post).toHaveBeenCalledWith('/api/connectors/catalog/github-app/installations', {
        installationId: '111',
        displayName: 'Acme Books',
      });
      expect(client.get).toHaveBeenCalledWith('/api/commands/corr-add');
      const text = out.join('\n');
      expect(text).toContain('corr-add');
      expect(text).toMatch(/github-app-acme/);
    });

    it('throws when waitForCommand reports failure', async () => {
      const client = {
        get: vi.fn().mockResolvedValue({ status: 'failed', result: 'install_failed' }),
        post: vi.fn().mockResolvedValue({ correlationId: 'corr-bad', slug: 'github-app-x' }),
      };
      await expect(
        runConnectorAppInstallationsAdd(
          // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
          client as any,
          { installationId: '111', label: 'X' },
          () => {},
        ),
      ).rejects.toThrow(/install_failed/);
    });
  });

  describe('uninstall', () => {
    it('POSTs /catalog/github-app/uninstall-app with confirmAppName and waits', async () => {
      const client = {
        get: vi.fn().mockResolvedValue({ status: 'success', result: null }),
        post: vi.fn().mockResolvedValue({ correlationId: 'corr-un' }),
      };
      const out: string[] = [];
      await runConnectorAppUninstall(
        // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
        client as any,
        { confirm: 'Acme Corp App' },
        (line) => out.push(line),
      );
      expect(client.post).toHaveBeenCalledWith('/api/connectors/catalog/github-app/uninstall-app', {
        confirmAppName: 'Acme Corp App',
      });
      expect(client.get).toHaveBeenCalledWith('/api/commands/corr-un');
      const text = out.join('\n');
      expect(text).toContain('corr-un');
      expect(text).toMatch(/uninstalled/);
    });

    it('uses the prompter when --confirm is not provided', async () => {
      const client = {
        get: vi.fn().mockResolvedValue({ status: 'success', result: null }),
        post: vi.fn().mockResolvedValue({ correlationId: 'corr-prompt' }),
      };
      const prompter = vi.fn().mockResolvedValue('Acme Corp App');
      await runConnectorAppUninstall(
        // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
        client as any,
        { prompter },
        () => {},
      );
      expect(prompter).toHaveBeenCalledTimes(1);
      expect(client.post).toHaveBeenCalledWith('/api/connectors/catalog/github-app/uninstall-app', {
        confirmAppName: 'Acme Corp App',
      });
    });

    it('rejects an empty confirmation value', async () => {
      const client = { get: vi.fn(), post: vi.fn() };
      const prompter = vi.fn().mockResolvedValue('');
      await expect(
        runConnectorAppUninstall(
          // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
          client as any,
          { prompter },
          () => {},
        ),
      ).rejects.toThrow(/empty/i);
      expect(client.post).not.toHaveBeenCalled();
    });

    it('throws when waitForCommand reports failure', async () => {
      const client = {
        get: vi.fn().mockResolvedValue({ status: 'failed', result: 'cleanup_failed' }),
        post: vi.fn().mockResolvedValue({ correlationId: 'corr-fail' }),
      };
      await expect(
        runConnectorAppUninstall(
          // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
          client as any,
          { confirm: 'Acme Corp App' },
          () => {},
        ),
      ).rejects.toThrow(/cleanup_failed/);
    });
  });
});
