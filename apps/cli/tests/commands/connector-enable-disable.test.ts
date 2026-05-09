import { describe, expect, it, vi } from 'vitest';
import { runConnectorDisable } from '@/commands/connector-disable.js';
import { runConnectorEnable } from '@/commands/connector-enable.js';
import { runConnectorUninstall } from '@/commands/connector-uninstall.js';

describe('zeno connector enable', () => {
  it('PATCHes /:id/toggle when current status differs from target', async () => {
    const client = {
      get: vi.fn().mockResolvedValue({ id: 'abc', status: 'disabled' }),
      patch: vi.fn().mockResolvedValue({ status: 'enabled' }),
    };
    const out: string[] = [];
    await runConnectorEnable(
      // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
      client as any,
      { target: 'sentry' },
      (line) => out.push(line),
    );
    expect(client.get).toHaveBeenCalledWith('/api/connectors/sentry');
    expect(client.patch).toHaveBeenCalledWith('/api/connectors/abc/toggle');
    expect(out.join('\n')).toContain('enabled');
  });

  it('skips toggle if already in desired state', async () => {
    const client = {
      get: vi.fn().mockResolvedValue({ id: 'abc', status: 'enabled' }),
      patch: vi.fn(),
    };
    const out: string[] = [];
    await runConnectorEnable(
      // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
      client as any,
      { target: 'sentry' },
      (line) => out.push(line),
    );
    expect(client.patch).not.toHaveBeenCalled();
    expect(out.join('\n')).toContain('already enabled');
  });
});

describe('zeno connector disable', () => {
  it('PATCHes /:id/toggle when current status is enabled', async () => {
    const client = {
      get: vi.fn().mockResolvedValue({ id: 'abc', status: 'enabled' }),
      patch: vi.fn().mockResolvedValue({ status: 'disabled' }),
    };
    const out: string[] = [];
    await runConnectorDisable(
      // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
      client as any,
      { target: 'sentry' },
      (line) => out.push(line),
    );
    expect(client.patch).toHaveBeenCalledWith('/api/connectors/abc/toggle');
    expect(out.join('\n')).toContain('disabled');
  });

  it('skips toggle if already disabled', async () => {
    const client = {
      get: vi.fn().mockResolvedValue({ id: 'abc', status: 'disabled' }),
      patch: vi.fn(),
    };
    const out: string[] = [];
    await runConnectorDisable(
      // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
      client as any,
      { target: 'sentry' },
      (line) => out.push(line),
    );
    expect(client.patch).not.toHaveBeenCalled();
    expect(out.join('\n')).toContain('already disabled');
  });
});

describe('zeno connector uninstall', () => {
  it('refuses without --yes flag', async () => {
    const client = {
      get: vi.fn(),
      delete: vi.fn(),
    };
    await expect(
      runConnectorUninstall(
        // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
        client as any,
        { target: 'sentry', yes: false },
        () => {},
      ),
    ).rejects.toThrow(/--yes/);
    expect(client.get).not.toHaveBeenCalled();
    expect(client.delete).not.toHaveBeenCalled();
  });

  it('DELETEs /api/connectors/:id and polls correlationId when --yes is set', async () => {
    const client = {
      get: vi
        .fn()
        // First call: connector lookup.
        .mockResolvedValueOnce({ id: 'abc', status: 'enabled' })
        // Subsequent calls: command status polls.
        .mockResolvedValue({ status: 'success', result: null }),
      delete: vi.fn().mockResolvedValue({ correlationId: 'corr-9' }),
    };
    const out: string[] = [];
    await runConnectorUninstall(
      // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
      client as any,
      { target: 'sentry', yes: true },
      (line) => out.push(line),
    );
    expect(client.delete).toHaveBeenCalledWith('/api/connectors/abc');
    expect(client.get).toHaveBeenCalledWith('/api/commands/corr-9');
    const text = out.join('\n');
    expect(text).toContain('corr-9');
    expect(text).toContain('uninstalled');
  });

  it('throws when waitForCommand reports failure', async () => {
    const client = {
      get: vi
        .fn()
        .mockResolvedValueOnce({ id: 'abc', status: 'enabled' })
        .mockResolvedValue({ status: 'failed', result: 'cleanup_error' }),
      delete: vi.fn().mockResolvedValue({ correlationId: 'corr-10' }),
    };
    await expect(
      runConnectorUninstall(
        // biome-ignore lint/suspicious/noExplicitAny: mocked client narrows to ApiClient subset
        client as any,
        { target: 'sentry', yes: true },
        () => {},
      ),
    ).rejects.toThrow(/uninstall failed/);
  });
});
