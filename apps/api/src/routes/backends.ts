/**
 * Spec 0071 — REST + SSE endpoints for the dashboard's `/settings/backend`
 * surface and `/onboarding/connect-claude` flow.
 *
 * Endpoints:
 *   GET    /                             list catalog merged with status
 *   GET    /:id                          single backend detail
 *   POST   /:id/credentials              paste-token path (regex + verify + save)
 *   POST   /:id/oauth/start              spawn auto-flow CLI, return session_id
 *   GET    /:id/oauth/:sessionId/stream  SSE — events: device_code_url, token_captured, success, error
 *   POST   /:id/oauth/:sessionId/cancel  kill the spawned CLI
 *   PUT    /active                       set active_backend_id
 *
 * SECURITY:
 *   - The backend NEVER returns the encrypted token value, ciphertext bytes,
 *     length, prefix, or sha256. Only `{configured, status, last_tested_at}`.
 *   - The OAuth SSE stream NEVER emits the token — the route runs the
 *     verification handshake server-side and emits success/error events only.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zValidator } from '@hono/zod-validator';
import type { BackendCredentialsRepo, BackendSettingsRepo } from '@zeno/db/runtime';
import { Hono } from 'hono';
import { z } from 'zod';
import { type BackendsCatalog, loadBackendsCatalog } from '@/lib/backends-catalog-loader';
import { testClaudeToken } from '@/lib/claude-test';
import { OAuthRegistry } from '@/lib/oauth-sessions';

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
  /** Optional injection point for tests — replaces the in-process OAuth registry. */
  oauthRegistry?: OAuthRegistry;
  /** Spec 0071: pino-shaped logger for the OAuth registry to emit
   *  observability events (oauth_session_started / _input_forwarded /
   *  _exit_ok / _exit_no_token). */
  apiLogger?: { info: (o: object, m: string) => void; warn: (o: object, m: string) => void };
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
  const oauthRegistry = deps.oauthRegistry ?? new OAuthRegistry();

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
      // Spec 0071: surface the active profile so the dashboard can render
      // "scope · <profile>" without hardcoding the wrong value.
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

  router.post(
    '/:id/credentials',
    zValidator(
      'json',
      z.object({
        token: z.string().min(1),
      }),
    ),
    async (c) => {
      const id = c.req.param('id');
      const backend = catalog.backends.find((b) => b.id === id);
      if (!backend) return c.json({ error: 'unknown_backend' }, 404);
      const { token } = c.req.valid('json');
      const field = backend.auth_schema[0];
      if (!field) return c.json({ error: 'no_auth_field' }, 500);
      if (field.regex) {
        const re = new RegExp(field.regex);
        if (!re.test(token)) {
          return c.json({ error: 'invalid_format', hint: field.regex_hint ?? null }, 400);
        }
      }

      const result = await testClaudeToken({
        token,
        model: backend.test.model,
        ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
      });
      if (result.kind === 'unauthorized') {
        return c.json({ error: 'unauthorized' }, 401);
      }
      if (result.kind === 'rate_limited') {
        const body: Record<string, unknown> = { error: 'rate_limited' };
        if (result.retryAfterSec !== undefined) body.retryAfterSec = result.retryAfterSec;
        return c.json(body, 429);
      }
      // network OR ok → save (network ⇒ status='untested', operator can retry)
      deps.backendCredentialsRepo.upsert({
        backendId: id,
        fieldName: field.field,
        value: token,
      });
      const status = result.kind === 'ok' ? 'active' : 'untested';
      deps.backendCredentialsRepo.setStatus(id, status, Date.now());
      return c.json({ ok: true, status });
    },
  );

  router.post('/:id/oauth/start', (c) => {
    const id = c.req.param('id');
    const backend = catalog.backends.find((b) => b.id === id);
    if (!backend) return c.json({ error: 'unknown_backend' }, 404);
    const sess = oauthRegistry.start({
      command: backend.auto_flow.command,
      urlRegex: new RegExp(backend.auto_flow.stdout_url_regex),
      tokenRegex: new RegExp(backend.auto_flow.stdout_token_regex),
      ...(backend.auto_flow.stdout_awaiting_code_regex
        ? { awaitingCodeRegex: new RegExp(backend.auto_flow.stdout_awaiting_code_regex) }
        : {}),
      // Pass through pino-shaped logger so OAuthRegistry observability lands
      // in the api logs (oauth_session_started / _input_forwarded / _exit_ok
      // / _exit_no_token). Pino's `.info`/`.warn` accept (obj, msg) so the
      // shape matches OAuthRegistryOpts.logger.
      ...(deps.apiLogger ? { logger: deps.apiLogger } : {}),
    });
    return c.json({ session_id: sess.id });
  });

  // Spec 0071: forward the OAuth callback code from the dashboard into the
  // CLI's stdin. The CLI then exchanges code → access token and prints the
  // token, which the SSE stream picks up and persists.
  router.post(
    '/:id/oauth/:session/input',
    zValidator(
      'json',
      z.object({
        text: z.string().min(1),
      }),
    ),
    (c) => {
      const sess = oauthRegistry.get(c.req.param('session'));
      if (!sess) return c.json({ error: 'session_not_found' }, 404);
      const { text } = c.req.valid('json');
      sess.sendInput(text);
      return c.json({ ok: true });
    },
  );

  router.get('/:id/oauth/:session/stream', (c) => {
    const id = c.req.param('id');
    const sessionId = c.req.param('session');
    const backend = catalog.backends.find((b) => b.id === id);
    if (!backend) return c.text('unknown backend', 404);
    const sess = oauthRegistry.get(sessionId);
    if (!sess) return c.text('session not found', 404);

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        let closed = false;
        const send = (ev: object) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
          } catch {
            // Controller may have been closed by client disconnect; ignore.
          }
        };
        const finish = () => {
          if (closed) return;
          closed = true;
          try {
            controller.close();
          } catch {
            // ignore
          }
          sess.emitter.removeListener('event', onEvent);
        };
        const onEvent = async (ev: { type: string; [k: string]: unknown }) => {
          if (closed) return;
          if (ev.type === 'token_captured') {
            send({ type: 'token_captured' });
            send({ type: 'verifying' });
            const token = sess.capturedToken;
            if (!token) {
              send({ type: 'error', kind: 'cli', message: 'token captured but unreadable' });
              finish();
              return;
            }
            const result = await testClaudeToken({
              token,
              model: backend.test.model,
              ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
            });
            if (result.kind === 'ok') {
              const field = backend.auth_schema[0];
              if (field) {
                deps.backendCredentialsRepo.upsert({
                  backendId: id,
                  fieldName: field.field,
                  value: token,
                });
                deps.backendCredentialsRepo.setStatus(id, 'active', Date.now());
              }
              send({ type: 'success' });
            } else if (result.kind === 'unauthorized') {
              send({
                type: 'error',
                kind: 'unauthorized',
                message: 'Anthropic rejected the captured token',
              });
            } else if (result.kind === 'rate_limited') {
              const body: Record<string, unknown> = {
                type: 'error',
                kind: 'rate_limited',
                message: 'Anthropic throttled the test handshake',
              };
              if (result.retryAfterSec !== undefined) body.retryAfterSec = result.retryAfterSec;
              send(body);
            } else {
              // network — save with status='untested' so operator can retry
              const field = backend.auth_schema[0];
              if (field) {
                deps.backendCredentialsRepo.upsert({
                  backendId: id,
                  fieldName: field.field,
                  value: token,
                });
                deps.backendCredentialsRepo.setStatus(id, 'untested', Date.now());
              }
              send({ type: 'error', kind: 'network', message: result.reason });
            }
            finish();
            return;
          }
          if (ev.type === 'error') {
            send(ev);
            finish();
            return;
          }
          // device_code_url, awaiting_code, status, verifying — pass through.
          send(ev);
        };
        sess.emitter.on('event', onEvent);
      },
    });
    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      },
    });
  });

  router.post('/:id/oauth/:session/cancel', (c) => {
    const sessionId = c.req.param('session');
    const sess = oauthRegistry.get(sessionId);
    if (sess) sess.cancel();
    return c.json({ ok: true });
  });

  router.put(
    '/active',
    zValidator(
      'json',
      z.object({
        backend_id: z.string().min(1),
      }),
    ),
    (c) => {
      const { backend_id } = c.req.valid('json');
      if (!catalog.backends.some((b) => b.id === backend_id)) {
        return c.json({ error: 'unknown_backend' }, 400);
      }
      deps.backendSettingsRepo.set('active_backend_id', backend_id);
      return c.json({ ok: true });
    },
  );

  return router;
}
