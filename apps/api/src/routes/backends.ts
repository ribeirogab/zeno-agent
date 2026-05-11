/**
 * Spec 0072 — read-only backends API + a single live-ping mutation.
 *
 * Endpoints:
 *   GET  /                  list catalog merged with status
 *   GET  /:id               single backend detail
 *   POST /:id/test          live Anthropic ping → updates last_tested_at + status
 *   GET  /icons/:filename   serve backend logos
 *
 * The dashboard NEVER mutates credentials or active backend selection — that
 * surface moved to the `zeno backend` CLI subtree (spec 0072 / Phase 7).
 *
 * SECURITY:
 *   - The backend NEVER returns the encrypted token value, ciphertext bytes,
 *     length, prefix, or sha256. Only `{configured, status, last_tested_at}`.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type BackendsCatalog, loadBackendsCatalog, testClaudeToken } from '@zeno/backends';
import type { BackendCredentialsRepo, BackendSettingsRepo } from '@zeno/db/runtime';
import { Hono } from 'hono';

export interface BackendsRouteDeps {
  backendCredentialsRepo: BackendCredentialsRepo;
  backendSettingsRepo: BackendSettingsRepo;
  /** Spec 0071: active profile id, surfaced in GET / for the dashboard's
   *  "scope · <profile>" meta line. */
  profileId: string;
  /** Optional — falls back to loading the on-disk catalog. Tests may pass a fixture. */
  catalog?: BackendsCatalog;
  /** Optional injection point for tests — replaces the global fetch in
   *  testClaudeToken calls. */
  fetchImpl?: typeof fetch;
}

function findAgentDir(): string | null {
  if (existsSync('/app/agent')) return '/app/agent';
  if (existsSync('agent')) return 'agent';
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    const candidate = resolve(dir, 'agent');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function buildBackendsRoute(deps: BackendsRouteDeps): Hono {
  const router = new Hono();
  const catalog = deps.catalog ?? loadBackendsCatalog();

  // GET /icons/:filename — serve backend logos from agent/assets/backends/.
  // Must be registered BEFORE the dynamic /:id routes so it doesn't collide.
  router.get('/icons/:filename', (c) => {
    const filename = c.req.param('filename');
    // Defensive — only serve files referenced by the backends catalog
    // (path-traversal guard).
    const knownIcons = new Set(
      catalog.backends.map((b) => b.logo.split('/').pop()).filter((x): x is string => Boolean(x)),
    );
    if (!knownIcons.has(filename)) return c.json({ error: 'not_found' }, 404);
    const agentDir = findAgentDir();
    if (!agentDir) return c.json({ error: 'agent_dir_not_found' }, 500);
    const path = `${agentDir}/assets/backends/${filename}`;
    if (!existsSync(path)) return c.json({ error: 'not_found' }, 404);
    const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
    const mime =
      ext === '.png'
        ? 'image/png'
        : ext === '.jpg' || ext === '.jpeg'
          ? 'image/jpeg'
          : 'image/svg+xml';
    return new Response(new Uint8Array(readFileSync(path)), {
      status: 200,
      headers: { 'Content-Type': mime, 'Cache-Control': 'public, max-age=300' },
    });
  });

  router.get('/', (c) => {
    const statusByBackend = new Map(
      deps.backendCredentialsRepo.listStatuses().map((s) => [s.backendId, s]),
    );
    const active =
      deps.backendSettingsRepo.get('active_backend_id') ?? catalog.backends[0]?.id ?? null;
    return c.json({
      profile_id: deps.profileId,
      active_backend_id: active,
      backends: catalog.backends.map((b) => {
        const s = statusByBackend.get(b.id);
        return {
          id: b.id,
          name: b.name,
          description: b.description,
          logo: b.logo,
          logoUrl: `/api/backends/icons/${b.logo.split('/').pop()}`,
          setup_doc_url: b.setup_doc_url,
          auth_schema: b.auth_schema,
          status: s?.status ?? 'not_configured',
          last_tested_at: s?.lastTestedAt ?? null,
          last_auth_alert_at: s?.lastAuthAlertAt ?? null,
        };
      }),
    });
  });

  router.get('/:id', (c) => {
    const id = c.req.param('id');
    const backend = catalog.backends.find((b) => b.id === id);
    if (!backend) return c.json({ error: 'unknown_backend' }, 404);
    const s = deps.backendCredentialsRepo.listStatuses().find((row) => row.backendId === id);
    return c.json({
      id: backend.id,
      name: backend.name,
      description: backend.description,
      logo: backend.logo,
      setup_doc_url: backend.setup_doc_url,
      auth_schema: backend.auth_schema,
      status: s?.status ?? 'not_configured',
      last_tested_at: s?.lastTestedAt ?? null,
      last_auth_alert_at: s?.lastAuthAlertAt ?? null,
    });
  });

  // Spec 0072 — POST /:id/test re-runs the live ping using the already-stored
  // token (read via getValue → decrypted in-process by the repo). Updates
  // last_tested_at + status. Never accepts or returns credential bytes.
  router.post('/:id/test', async (c) => {
    const id = c.req.param('id');
    const backend = catalog.backends.find((b) => b.id === id);
    if (!backend) return c.json({ error: 'unknown_backend' }, 404);
    const field = backend.auth_schema[0];
    if (!field) return c.json({ error: 'no_auth_field' }, 500);
    const token = deps.backendCredentialsRepo.getValue(id, field.field);
    if (!token) return c.json({ error: 'not_configured' }, 400);
    const result = await testClaudeToken({
      token,
      model: backend.test.model,
      ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
    });
    const status =
      result.kind === 'ok' ? 'active' : result.kind === 'unauthorized' ? 'expired' : 'untested';
    deps.backendCredentialsRepo.setStatus(id, status, Date.now());
    return c.json({ ok: true, status, kind: result.kind });
  });

  return router;
}
