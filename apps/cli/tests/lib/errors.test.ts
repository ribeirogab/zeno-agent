import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-client.js';
import { friendly, runCommand } from '@/lib/errors.js';

const apiErr = (status: number, body: unknown) =>
  new ApiError(status, body, `${status} ${JSON.stringify(body)}`);

describe('friendly', () => {
  it('maps single_instance_catalog_already_installed', () => {
    const e = apiErr(409, {
      error: 'single_instance_catalog_already_installed',
      catalogId: 'playwright',
      slug: 'playwright',
    });
    const h = friendly(e);
    expect(h.msg).toBe('playwright already installed (single-instance)');
    expect(h.hint).toBe('uninstall first: zeno connector uninstall playwright');
  });

  it('maps auth_failed with slug+key (default context)', () => {
    const e = apiErr(401, {
      error: 'auth_failed',
      detail: 'invalid token',
      slug: 'linear-acme',
      key: '__MCP_AUTHORIZATION__',
    });
    const h = friendly(e);
    expect(h.msg).toContain('auth failed');
    expect(h.msg).toContain('invalid token');
    expect(h.hint).toBe(
      'update token: zeno connector secret set linear-acme __MCP_AUTHORIZATION__',
    );
  });

  it('maps auth_failed during install with catalogId+key', () => {
    const e = apiErr(401, {
      error: 'auth_failed',
      detail: 'invalid token',
      catalogId: 'linear',
      key: '__MCP_AUTHORIZATION__',
    });
    const h = friendly(e, 'install');
    expect(h.hint).toBe(
      'verify token, then retry: zeno connector install linear --secret __MCP_AUTHORIZATION__=VALUE',
    );
  });

  it('maps auth_failed during test with slug+key', () => {
    const e = apiErr(401, {
      error: 'auth_failed',
      detail: 'invalid token',
      slug: 'linear-acme',
      key: '__MCP_AUTHORIZATION__',
    });
    const h = friendly(e, 'test');
    expect(h.hint).toBe(
      'update token: zeno connector secret set linear-acme __MCP_AUTHORIZATION__',
    );
  });

  it('maps auth_failed during reveal with slug+key', () => {
    const e = apiErr(401, {
      error: 'auth_failed',
      detail: 'invalid token',
      slug: 'linear-acme',
      key: '__MCP_AUTHORIZATION__',
    });
    const h = friendly(e, 'reveal');
    expect(h.hint).toBe(
      'update token: zeno connector secret set linear-acme __MCP_AUTHORIZATION__',
    );
  });

  it('maps auth_failed without slug+key (no hint)', () => {
    const e = apiErr(401, { error: 'auth_failed' });
    const h = friendly(e);
    expect(h.msg).toContain('auth failed');
    expect(h.hint).toBeUndefined();
  });

  it('maps rate_limited with retryAfter', () => {
    const e = apiErr(429, { error: 'rate_limited', retryAfter: 30 });
    const h = friendly(e);
    expect(h.msg).toBe('rate limited');
    expect(h.hint).toBe('retry after 30s');
  });

  it('maps mode_cli_only', () => {
    const e = apiErr(403, { error: 'mode_cli_only' });
    const h = friendly(e);
    expect(h.msg).toContain('CLI-only');
    expect(h.hint).toBeDefined();
  });

  it('maps catalog_entry_not_found', () => {
    const e = apiErr(404, { error: 'catalog_entry_not_found', catalogId: 'mystery' });
    const h = friendly(e);
    expect(h.msg).toContain('mystery');
    expect(h.hint).toContain('zeno connector catalog');
  });

  it('falls back to raw message for unknown codes', () => {
    const e = apiErr(500, { error: 'something_unknown' });
    expect(friendly(e).msg).toContain('500');
    expect(friendly(e).hint).toBeUndefined();
  });

  it('falls back when body has no error field', () => {
    const e = apiErr(500, {});
    expect(friendly(e).msg).toContain('500');
  });

  it('falls back when body is null', () => {
    const e = apiErr(500, null);
    expect(friendly(e).msg).toContain('500');
  });
});

describe('runCommand', () => {
  it('runs the function and returns the value when no throw', async () => {
    expect(await runCommand(async () => 42)).toBe(42);
  });

  it('catches ApiError, prints friendly + exits 1', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    await runCommand(async () => {
      throw apiErr(409, {
        error: 'single_instance_catalog_already_installed',
        catalogId: 'playwright',
        slug: 'playwright',
      });
    });
    expect(exit).toHaveBeenCalledWith(1);
    const out = stderr.mock.calls.map((c) => String(c[0])).join('');
    expect(out).toContain('playwright already installed');
    expect(out).toContain('uninstall first');
    exit.mockRestore();
    stderr.mockRestore();
  });

  it('rethrows non-ApiError', async () => {
    await expect(
      runCommand(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
  });
});
