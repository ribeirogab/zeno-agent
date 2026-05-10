import { describe, expect, it, vi } from 'vitest';
import { runConnectorInstall } from '@/commands/connector-install.js';

describe('zeno connector install', () => {
  it('POSTs to /api/connectors and waits for the command to succeed', async () => {
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
    };
    const out: string[] = [];
    await runConnectorInstall(
      // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
      client as any,
      {
        catalogId: 'linear',
        label: 'Acme workspace',
        secrets: { __MCP_AUTHORIZATION__: 'tok' },
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
    };
    await expect(
      runConnectorInstall(
        // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
        client as any,
        { catalogId: 'unknown' },
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
    };
    await expect(
      runConnectorInstall(
        // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
        client as any,
        { catalogId: 'linear' },
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
    };
    await expect(
      runConnectorInstall(
        // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
        client as any,
        { catalogId: 'sentry' },
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
    };
    await runConnectorInstall(
      // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
      client as any,
      {
        catalogId: 'linear',
        secrets: { __MCP_AUTHORIZATION__: 'lin_api_xyz' },
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
    };
    await runConnectorInstall(
      // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
      client as any,
      {
        catalogId: 'linear',
        secrets: { __MCP_AUTHORIZATION__: 'Bearer lin_api_already' },
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
});
