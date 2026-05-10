import { describe, expect, it, vi } from 'vitest';
import { runConnectorInstall } from '@/commands/connector-install.js';

describe('zeno connector install', () => {
  it('POSTs to /api/connectors and waits for the command to succeed (verify: false)', async () => {
    const client = {
      get: vi
        .fn()
        // First call: catalog lookup.
        .mockResolvedValueOnce([
          {
            id: 'linear',
            secrets: [{ key: '__MCP_AUTHORIZATION__', required: true, label: 'Linear API key' }],
          },
        ])
        // Subsequent calls: command status polls.
        .mockResolvedValue({ status: 'success', result: null }),
      post: vi.fn().mockResolvedValue({ correlationId: 'corr-1' }),
      delete: vi.fn(),
    };
    const out: string[] = [];
    await runConnectorInstall(
      // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
      client as any,
      {
        catalogId: 'linear',
        label: 'Acme workspace',
        secrets: { __MCP_AUTHORIZATION__: 'tok' },
        verify: false,
      },
      (line) => out.push(line),
    );
    expect(client.post).toHaveBeenCalledWith(
      '/api/connectors',
      expect.objectContaining({
        source: 'catalog',
        catalogId: 'linear',
        instanceLabel: 'Acme workspace',
        secrets: [{ key: '__MCP_AUTHORIZATION__', value: 'tok' }],
      }),
    );
    expect(client.get).toHaveBeenCalledWith('/api/commands/corr-1');
    const text = out.join('\n');
    expect(text).toContain('corr-1');
    expect(text).toContain('installed');
  });

  it('throws when the catalog entry is unknown', async () => {
    const client = {
      get: vi.fn().mockResolvedValue([]),
      post: vi.fn(),
      delete: vi.fn(),
    };
    await expect(
      runConnectorInstall(
        // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
        client as any,
        { catalogId: 'unknown', verify: false },
        () => {},
      ),
    ).rejects.toThrow(/catalog entry "unknown" not found/);
    expect(client.post).not.toHaveBeenCalled();
  });

  it('surfaces 403 mode_cli_only as a clear error', async () => {
    const client = {
      get: vi.fn().mockResolvedValue([{ id: 'linear', secrets: [] }]),
      post: vi.fn().mockRejectedValue(
        Object.assign(new Error('POST /api/connectors -> 403'), {
          status: 403,
          body: { error: 'mode_cli_only' },
        }),
      ),
      delete: vi.fn(),
    };
    await expect(
      runConnectorInstall(
        // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
        client as any,
        { catalogId: 'linear', verify: false },
        () => {},
      ),
    ).rejects.toThrow();
  });

  it('throws when waitForCommand reports failure', async () => {
    const client = {
      get: vi
        .fn()
        .mockResolvedValueOnce([{ id: 'sentry', secrets: [] }])
        .mockResolvedValue({ status: 'failed', result: 'auth_failed' }),
      post: vi.fn().mockResolvedValue({ correlationId: 'corr-2' }),
      delete: vi.fn(),
    };
    await expect(
      runConnectorInstall(
        // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
        client as any,
        { catalogId: 'sentry', verify: false },
        () => {},
      ),
    ).rejects.toThrow(/install failed: auth_failed/);
  });

  it('applies the catalog prefix to operator-supplied secrets', async () => {
    const client = {
      get: vi
        .fn()
        .mockResolvedValueOnce([
          {
            id: 'linear',
            secrets: [{ key: '__MCP_AUTHORIZATION__', required: true, prefix: 'Bearer ' }],
          },
        ])
        .mockResolvedValue({ status: 'success', result: null }),
      post: vi.fn().mockResolvedValue({ correlationId: 'corr-prefix' }),
      delete: vi.fn(),
    };
    await runConnectorInstall(
      // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
      client as any,
      {
        catalogId: 'linear',
        secrets: { __MCP_AUTHORIZATION__: 'lin_api_xyz' },
        verify: false,
      },
      () => {},
    );
    expect(client.post).toHaveBeenCalledWith(
      '/api/connectors',
      expect.objectContaining({
        secrets: [{ key: '__MCP_AUTHORIZATION__', value: 'Bearer lin_api_xyz' }],
      }),
    );
  });

  it('does not double-apply the prefix when the value already contains it', async () => {
    const client = {
      get: vi
        .fn()
        .mockResolvedValueOnce([
          {
            id: 'linear',
            secrets: [{ key: '__MCP_AUTHORIZATION__', required: true, prefix: 'Bearer ' }],
          },
        ])
        .mockResolvedValue({ status: 'success', result: null }),
      post: vi.fn().mockResolvedValue({ correlationId: 'corr-noprefix' }),
      delete: vi.fn(),
    };
    await runConnectorInstall(
      // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
      client as any,
      {
        catalogId: 'linear',
        secrets: { __MCP_AUTHORIZATION__: 'Bearer lin_api_already' },
        verify: false,
      },
      () => {},
    );
    expect(client.post).toHaveBeenCalledWith(
      '/api/connectors',
      expect.objectContaining({
        secrets: [{ key: '__MCP_AUTHORIZATION__', value: 'Bearer lin_api_already' }],
      }),
    );
  });

  describe('auto-verify + rollback', () => {
    it('runs test against the new connector after install and prints "verified"', async () => {
      const client = {
        get: vi
          .fn()
          // 1. catalog lookup
          .mockResolvedValueOnce([{ id: 'linear', secrets: [] }])
          // 2. pre-install connector list (snapshot of slugs)
          .mockResolvedValueOnce([{ id: 'old', slug: 'github', catalogId: 'github' }])
          // 3. command status poll
          .mockResolvedValueOnce({ status: 'success', result: null })
          // 4. post-install connector list (find the new one)
          .mockResolvedValueOnce([
            { id: 'old', slug: 'github', catalogId: 'github' },
            { id: 'new', slug: 'linear', catalogId: 'linear' },
          ]),
        post: vi
          .fn()
          // 1. install POST
          .mockResolvedValueOnce({ correlationId: 'corr-v1' })
          // 2. test POST
          .mockResolvedValueOnce({ ok: true, tools: [{ name: 'a' }, { name: 'b' }], durationMs: 12 }),
        delete: vi.fn(),
      };
      const out: string[] = [];
      await runConnectorInstall(
        // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
        client as any,
        { catalogId: 'linear' },
        (line) => out.push(line),
      );
      expect(client.post).toHaveBeenNthCalledWith(2, '/api/connectors/new/test', undefined);
      const text = out.join('\n');
      expect(text).toContain('installed');
      expect(text).toMatch(/verifying/);
      expect(text).toMatch(/verified . 2 tools/);
      expect(client.delete).not.toHaveBeenCalled();
    });

    it('auto-uninstalls and exits 1 when the test fails', async () => {
      const client = {
        get: vi
          .fn()
          .mockResolvedValueOnce([{ id: 'linear', secrets: [] }])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce({ status: 'success', result: null })
          .mockResolvedValueOnce([{ id: 'new', slug: 'linear', catalogId: 'linear' }]),
        post: vi
          .fn()
          .mockResolvedValueOnce({ correlationId: 'corr-v2' })
          .mockResolvedValueOnce({
            ok: false,
            errorKind: 'auth_failed',
            error: 'invalid_token',
          }),
        delete: vi.fn().mockResolvedValue({ correlationId: 'corr-rb' }),
      };
      const out: string[] = [];
      await expect(
        runConnectorInstall(
          // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
          client as any,
          { catalogId: 'linear' },
          (line) => out.push(line),
        ),
      ).rejects.toThrow(/install verification failed: invalid_token/);
      expect(client.delete).toHaveBeenCalledWith('/api/connectors/new');
      const text = out.join('\n');
      expect(text).toMatch(/verification failed/);
      expect(text).toMatch(/rolling back/);
      expect(text).toMatch(/uninstalled/);
    });

    it('skips verify when verify: false (no extra GET, no POST /test, no delete)', async () => {
      const client = {
        get: vi
          .fn()
          .mockResolvedValueOnce([{ id: 'linear', secrets: [] }])
          .mockResolvedValue({ status: 'success', result: null }),
        post: vi.fn().mockResolvedValue({ correlationId: 'corr-skip' }),
        delete: vi.fn(),
      };
      await runConnectorInstall(
        // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
        client as any,
        { catalogId: 'linear', verify: false },
        () => {},
      );
      // post called once (install), never twice (no test POST).
      expect(client.post).toHaveBeenCalledTimes(1);
      // get called for catalog + at least one command status; no /api/connectors snapshot.
      expect(client.get.mock.calls.some(([path]) => path === '/api/connectors')).toBe(false);
      expect(client.delete).not.toHaveBeenCalled();
    });
  });
});
