import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { blockIfCli } from '../../src/lib/block-if-cli.js';

function buildApp(writes: 'cli' | 'dashboard', action: string, cli: string): Hono {
  const app = new Hono();
  app.post('/x', (c) => {
    const blocked = blockIfCli(c, { writes, action, cli });
    if (blocked) return blocked;
    return c.text('ok');
  });
  return app;
}

describe('blockIfCli (spec 2026-05-11)', () => {
  it("returns 403 mode_cli_only when writes='cli' and X-Zeno-Origin missing", async () => {
    const app = buildApp('cli', 'install', 'zeno foo install');
    const res = await app.request('/x', { method: 'POST' });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: 'mode_cli_only',
      action: 'install',
      cli: 'zeno foo install',
    });
  });

  it("passes through when X-Zeno-Origin='cli'", async () => {
    const app = buildApp('cli', 'install', 'zeno foo install');
    const res = await app.request('/x', {
      method: 'POST',
      headers: { 'x-zeno-origin': 'cli' },
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
  });

  it("passes through when writes='dashboard' regardless of header", async () => {
    const app = buildApp('dashboard', 'install', 'zeno foo install');
    const res = await app.request('/x', { method: 'POST' });
    expect(res.status).toBe(200);
  });

  it('rejects when X-Zeno-Origin has a foreign value (case-sensitive literal match)', async () => {
    const app = buildApp('cli', 'install', 'zeno foo install');
    const res = await app.request('/x', {
      method: 'POST',
      headers: { 'x-zeno-origin': 'CLI' },
    });
    expect(res.status).toBe(403);
  });
});
