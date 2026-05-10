import { describe, expect, it, vi } from 'vitest';
import { runConnectorAppInstall } from '@/commands/connector-app-install.js';
import { runConnectorAppInstancesAdd } from '@/commands/connector-app-instances-add.js';
import { runConnectorAppInstancesDiscover } from '@/commands/connector-app-instances-discover.js';
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

  describe('instances discover', () => {
    it('POSTs /catalog/github-app/installations/discover and prints rows', async () => {
      const client = {
        get: vi.fn().mockResolvedValue([
          { id: 'github-app', terminology: { instance: 'Installation' } },
        ]),
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
      await runConnectorAppInstancesDiscover(
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

  describe('instances add', () => {
    it('POSTs /catalog/github-app/installations and waits for the command', async () => {
      const client = {
        get: vi
          .fn()
          // 1+. command status polls
          .mockResolvedValueOnce({ status: 'success', result: null })
          // 2. catalog terminology lookup
          .mockResolvedValueOnce([
            { id: 'github-app', terminology: { instance: 'Installation' } },
          ]),
        post: vi.fn().mockResolvedValue({ correlationId: 'corr-add', slug: 'github-app-acme' }),
      };
      const out: string[] = [];
      await runConnectorAppInstancesAdd(
        // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
        client as any,
        { instanceId: '111', label: 'Acme Books' },
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
      expect(text).toMatch(/installation added/);
    });

    it('throws when waitForCommand reports failure', async () => {
      const client = {
        get: vi.fn().mockResolvedValue({ status: 'failed', result: 'install_failed' }),
        post: vi.fn().mockResolvedValue({ correlationId: 'corr-bad', slug: 'github-app-x' }),
      };
      await expect(
        runConnectorAppInstancesAdd(
          // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
          client as any,
          { instanceId: '111', label: 'X' },
          () => {},
        ),
      ).rejects.toThrow(/install_failed/);
    });
  });

  describe('uninstall', () => {
    it('POSTs /catalog/github-app/uninstall-app with empty body and waits', async () => {
      const client = {
        get: vi.fn().mockResolvedValue({ status: 'success', result: null }),
        post: vi.fn().mockResolvedValue({ correlationId: 'corr-un' }),
      };
      const out: string[] = [];
      await runConnectorAppUninstall(
        // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
        client as any,
        (line) => out.push(line),
      );
      expect(client.post).toHaveBeenCalledWith(
        '/api/connectors/catalog/github-app/uninstall-app',
        {},
      );
      expect(client.get).toHaveBeenCalledWith('/api/commands/corr-un');
      const text = out.join('\n');
      expect(text).toContain('corr-un');
      expect(text).toMatch(/uninstalled/);
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
          () => {},
        ),
      ).rejects.toThrow(/cleanup_failed/);
    });
  });
});
