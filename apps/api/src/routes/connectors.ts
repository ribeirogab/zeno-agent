/**
 * Connectors API. Spec 0034.
 *
 * IMPORTANT — route registration order is load-bearing. Hono matches in
 * registration order. Static path segments under `/api/connectors/*` (e.g.
 * `/catalog`, `/test`, `/catalog/icons/*`) MUST be registered BEFORE any
 * dynamic `:id` route, otherwise a request for `/api/connectors/catalog`
 * would match `:id='catalog'` and 404. The order below honors that.
 */

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { zValidator } from '@hono/zod-validator';
import { discoverTools } from '@zeno/mcp-discover';
import type {
  CommandRepo,
  Connector,
  ConnectorRepo,
  ConnectorSecret,
  ToolCategory,
  ToolPermission,
} from '@zeno/storage';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  type CatalogEntry,
  CatalogReadError,
  findCatalogEntry,
  loadCatalog,
  resolveIconPath,
} from '@/lib/catalog-loader';
import { SecretRateLimiter } from '@/lib/secret-rate-limit';

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*$/;

function nowIso(): string {
  return new Date().toISOString();
}

function maskLast4(value: string): string {
  return value.length >= 4 ? value.slice(-4) : 'xxxx';
}

function slugify(displayName: string): string {
  return displayName
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9-\s]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Spec 0042: lowercase + kebab-case for github-app installation names.
// Different from slugify in that it doesn't first lowercase ASCII removal —
// installation names are user-controlled (e.g., "AcmeBooks", "Flavia-Nasser-OMS")
// and we want to preserve hyphens already present.
function kebabLower(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function resolveSlugCollision(repo: ConnectorRepo, base: string): string {
  if (!SLUG_REGEX.test(base)) {
    throw new Error(`derived slug ${JSON.stringify(base)} is invalid`);
  }
  if (!repo.getBySlug(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`;
    if (!repo.getBySlug(candidate)) return candidate;
  }
  throw new Error(`could not resolve slug collision for ${base}`);
}

function buildListItem(
  connector: Connector,
  toolCount: number,
  invocationCount24h: number,
  iconUrl: string | null,
): Record<string, unknown> {
  return {
    id: connector.id,
    slug: connector.slug,
    displayName: connector.displayName,
    description: connector.description,
    source: connector.source,
    catalogId: connector.catalogId,
    iconUrl,
    transport: connector.transport,
    status: connector.status,
    lastError: connector.lastError,
    lastErrorAt: connector.lastErrorAt,
    lastVerifiedAt: connector.lastVerifiedAt,
    toolCount,
    invocationCount24h,
  };
}

function iconUrlForConnector(connector: Connector): string | null {
  if (connector.source !== 'catalog' || !connector.catalogId) return null;
  try {
    const entry = findCatalogEntry(connector.catalogId);
    if (!entry) return null;
    return `/api/connectors/catalog/icons/${entry.icon}`;
  } catch {
    return null;
  }
}

// ─── Schemas ─────────────────────────────────────────────────────────────

const testConnectionSchema = z.object({
  transport: z.enum(['stdio', 'remote']),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  url: z.string().optional(),
  secrets: z.array(z.object({ key: z.string(), value: z.string() })),
});

const createCatalogSchema = z.object({
  source: z.literal('catalog'),
  catalogId: z.string(),
  secrets: z.array(z.object({ key: z.string(), value: z.string() })),
});

const createCustomSchema = z.object({
  source: z.literal('custom'),
  displayName: z.string().min(1),
  transport: z.enum(['stdio', 'remote']),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  url: z.string().optional(),
  secrets: z.array(z.object({ key: z.string(), value: z.string() })),
  tools: z
    .array(
      z.object({
        toolName: z.string(),
        description: z.string().nullable(),
        category: z.enum(['read', 'write', 'interactive']),
        permission: z.enum(['always_allow', 'ask', 'never']),
      }),
    )
    .optional(),
});

const createSchema = z.discriminatedUnion('source', [createCatalogSchema, createCustomSchema]);

const patchSchema = z.object({
  displayName: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  command: z.string().nullable().optional(),
  args: z.array(z.string()).nullable().optional(),
  url: z.string().nullable().optional(),
  secrets: z.array(z.object({ key: z.string(), value: z.string() })).optional(),
});

const permissionSchema = z.object({
  permission: z.enum(['always_allow', 'ask', 'never']),
});

const bulkPermissionSchema = z.object({
  category: z.enum(['read', 'write', 'interactive']),
  permission: z.enum(['always_allow', 'ask', 'never']),
});

// ─── Route ───────────────────────────────────────────────────────────────

export interface ConnectorsRouteDeps {
  connectors: ConnectorRepo;
  commands: CommandRepo;
  rateLimiter?: SecretRateLimiter;
}

export function buildConnectorsRoute(deps: ConnectorsRouteDeps): Hono {
  const route = new Hono();
  const rateLimiter = deps.rateLimiter ?? new SecretRateLimiter();

  // ── STATIC PATHS FIRST (avoid :id collisions) ──

  // GET /catalog
  route.get('/catalog', (c) => {
    let catalog: CatalogEntry[];
    try {
      catalog = loadCatalog();
    } catch (err) {
      if (err instanceof CatalogReadError) {
        return c.json({ error: err.message, detail: err.detail }, 500);
      }
      throw err;
    }
    const installedCatalogIds = new Set(
      deps.connectors
        .list({ source: 'catalog' })
        .map((connector) => connector.catalogId)
        .filter((id): id is string => id !== null),
    );
    const out = catalog.map((entry) => ({
      id: entry.id,
      name: entry.name,
      description: entry.description,
      iconUrl: `/api/connectors/catalog/icons/${entry.icon}`,
      docsUrl: entry.docsUrl,
      transport: entry.transport,
      secrets: entry.secrets,
      toolCount: entry.tools.length,
      isInstalled: installedCatalogIds.has(entry.id),
    }));
    return c.json(out);
  });

  // GET /catalog/icons/:filename
  route.get('/catalog/icons/:filename', (c) => {
    const filename = c.req.param('filename');
    // Defensive: only serve files referenced by the catalog (path traversal guard).
    let catalog: CatalogEntry[];
    try {
      catalog = loadCatalog();
    } catch {
      return c.json({ error: 'catalog_unavailable' }, 500);
    }
    const knownIcons = new Set(catalog.map((e) => e.icon));
    if (!knownIcons.has(filename)) return c.json({ error: 'not_found' }, 404);
    const path = resolveIconPath(filename);
    if (!path) return c.json({ error: 'not_found' }, 404);
    const body = readFileSync(path, 'utf8');
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml',
        // 5min cache: long enough for perf during a session, short enough that
        // catalog SVG edits propagate without forcing the operator to hard-reload.
        'Cache-Control': 'public, max-age=300',
      },
    });
  });

  // POST /catalog/:id/test (resolves transportConfig server-side; for catalog installs)
  route.post('/catalog/:id/test', async (c) => {
    const id = c.req.param('id');
    const entry = findCatalogEntry(id);
    if (!entry) return c.json({ error: 'catalog_entry_not_found' }, 404);
    const body = (await c.req.json().catch(() => ({}))) as {
      secrets?: Array<{ key: string; value: string }>;
    };
    const transient: Connector = {
      id: 'transient',
      slug: id,
      displayName: entry.name,
      description: entry.description,
      source: 'catalog',
      catalogId: id,
      transport: entry.transport,
      command: entry.transportConfig.command ?? null,
      args: entry.transportConfig.args ?? null,
      url: entry.transportConfig.url ?? null,
      status: 'pending',
      lastError: null,
      lastErrorAt: null,
      lastVerifiedAt: null,
      createdAt: '',
      updatedAt: '',
    };
    const secrets: ConnectorSecret[] = (body.secrets ?? []).map((s) => ({
      connectorId: 'transient',
      key: s.key,
      value: s.value,
    }));
    // Spec 0038 F#2: pass authCheckTool from the catalog entry so the
    // test endpoint actually validates credentials (not just tools/list).
    // Spec 0040: also pass authCheckArgs for MCPs requiring non-empty input.
    const result = await discoverTools(
      transient,
      secrets,
      entry.authCheckTool
        ? {
            authCheckTool: entry.authCheckTool,
            ...(entry.authCheckArgs ? { authCheckArgs: entry.authCheckArgs } : {}),
          }
        : {},
    );
    if ('error' in result) {
      return c.json({ ok: false, errorKind: result.errorKind, error: result.error });
    }
    return c.json({ ok: true, tools: result.tools, durationMs: result.durationMs });
  });

  // POST /catalog/github-app/install — Spec 0042: installs N github-app connectors
  // (one per installation) with the five reserved-key secrets. The runtime
  // (`mcp-build.ts` + `app-auth.ts`) recognizes `github-app-*` slugs and mints
  // installation tokens at MCP spawn time.
  //
  // Important: after a successful install, the worker must be restarted so
  // `loadGitHubAppConfig(connectors)` re-reads the DB rows and bootstraps the
  // token cache. Until then, the new github-app-* connectors will fail at MCP
  // spawn with "github-app token cache miss".
  route.post(
    '/catalog/github-app/install',
    zValidator(
      'json',
      z.object({
        appId: z.string().min(1),
        pem: z
          .string()
          .min(1)
          .refine((v) => v.includes('BEGIN RSA PRIVATE KEY') || v.includes('BEGIN PRIVATE KEY'), {
            message: 'pem must be a PEM-formatted RSA private key',
          }),
        installations: z
          .array(
            z.object({
              name: z.string().min(1),
              id: z.string().min(1),
              envVar: z
                .string()
                .min(1)
                .regex(/^[A-Z][A-Z0-9_]*$/, 'envVar must be UPPER_SNAKE_CASE'),
            }),
          )
          .min(1),
      }),
    ),
    (c) => {
      const body = c.req.valid('json');
      const slugs = new Set<string>();
      for (const inst of body.installations) {
        const slugCandidate = `github-app-${kebabLower(inst.name)}`;
        if (slugs.has(slugCandidate)) {
          return c.json({ error: 'duplicate_installation_name', name: inst.name }, 400);
        }
        slugs.add(slugCandidate);
      }

      const githubAppEntry = findCatalogEntry('github-app');
      if (!githubAppEntry) {
        return c.json({ error: 'github_app_catalog_entry_missing' }, 500);
      }

      // Enqueue one connector_create command per installation. Each row carries
      // the five __GITHUB_*__ reserved-key secrets. Worker handler creates the
      // row; mcp-build intercepts at MCP spawn to mint the actual PAT.
      for (const inst of body.installations) {
        const slug = resolveSlugCollision(deps.connectors, `github-app-${kebabLower(inst.name)}`);
        const payload = {
          source: 'catalog',
          catalogId: 'github-app',
          slug,
          displayName: `GitHub App — ${inst.name}`,
          description: githubAppEntry.description,
          transport: githubAppEntry.transport,
          command: githubAppEntry.transportConfig.command ?? null,
          args: githubAppEntry.transportConfig.args ?? null,
          url: githubAppEntry.transportConfig.url ?? null,
          secrets: [
            { key: '__GITHUB_APP_ID__', value: body.appId },
            { key: '__GITHUB_APP_PEM__', value: body.pem },
            { key: '__GITHUB_INSTALLATION_ID__', value: inst.id },
            { key: '__GITHUB_INSTALLATION_NAME__', value: inst.name },
            { key: '__GITHUB_ENV_VAR__', value: inst.envVar },
          ],
          tools: githubAppEntry.tools.map((t) => ({
            toolName: t.name,
            description: t.description,
            category: t.category,
            permission: t.defaultPermission,
          })),
        };
        deps.commands.enqueue({
          type: 'connector_create',
          payload,
          correlationId: randomUUID(),
        });
      }
      return c.json({ ok: true, count: body.installations.length });
    },
  );

  // POST /test (transient — not yet saved)
  route.post('/test', zValidator('json', testConnectionSchema), async (c) => {
    const body = c.req.valid('json');
    const transient: Connector = {
      id: 'transient',
      slug: 'transient',
      displayName: 'Transient',
      description: null,
      source: 'custom',
      catalogId: null,
      transport: body.transport,
      command: body.command ?? null,
      args: body.args ?? null,
      url: body.url ?? null,
      status: 'pending',
      lastError: null,
      lastErrorAt: null,
      lastVerifiedAt: null,
      createdAt: '',
      updatedAt: '',
    };
    const secrets: ConnectorSecret[] = body.secrets.map((s) => ({
      connectorId: 'transient',
      key: s.key,
      value: s.value,
    }));
    const result = await discoverTools(transient, secrets);
    if ('error' in result) {
      return c.json({ ok: false, errorKind: result.errorKind, error: result.error });
    }
    return c.json({ ok: true, tools: result.tools, durationMs: result.durationMs });
  });

  // GET / (list)
  route.get('/', (c) => {
    const all = deps.connectors.list();
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const items = all.map((connector) => {
      const tools = deps.connectors.getTools(connector.id);
      const invocations = deps.connectors.countInvocationsSince(connector.id, cutoff);
      return buildListItem(connector, tools.length, invocations, iconUrlForConnector(connector));
    });
    return c.json(items);
  });

  // POST / (create — enqueues command)
  route.post('/', zValidator('json', createSchema), (c) => {
    const body = c.req.valid('json');
    let payload: Record<string, unknown>;
    if (body.source === 'catalog') {
      const entry = findCatalogEntry(body.catalogId);
      if (!entry) return c.json({ error: 'catalog_entry_not_found' }, 404);
      // Use the catalog id as the slug; it's already kebab-case + unique within the catalog.
      // If the operator already installed this catalog entry (or a custom connector grabbed the slug),
      // resolve a collision suffix.
      const slug = resolveSlugCollision(deps.connectors, entry.id);
      payload = {
        source: 'catalog',
        catalogId: entry.id,
        slug,
        displayName: entry.name,
        description: entry.description,
        transport: entry.transport,
        command: entry.transportConfig.command ?? null,
        args: entry.transportConfig.args ?? null,
        url: entry.transportConfig.url ?? null,
        secrets: body.secrets,
        tools: entry.tools.map((t) => ({
          toolName: t.name,
          description: t.description,
          category: t.category,
          permission: t.defaultPermission,
        })),
      };
    } else {
      const slug = resolveSlugCollision(deps.connectors, slugify(body.displayName));
      payload = {
        source: 'custom',
        slug,
        displayName: body.displayName,
        transport: body.transport,
        command: body.command ?? null,
        args: body.args ?? null,
        url: body.url ?? null,
        secrets: body.secrets,
        tools: body.tools ?? [],
      };
    }
    deps.commands.enqueue({
      type: 'connector_create',
      payload,
      correlationId: randomUUID(),
    });
    return c.body(null, 204);
  });

  // ── DYNAMIC :id PATHS (after all statics) ──

  // GET /:id
  route.get('/:id', (c) => {
    const id = c.req.param('id');
    const connector = deps.connectors.get(id);
    if (!connector) return c.json({ error: 'not_found' }, 404);
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const secrets = deps.connectors.getSecrets(id);
    const tools = deps.connectors.getTools(id);
    const invocationCount24h = deps.connectors.countInvocationsSince(id, cutoff);
    return c.json({
      ...buildListItem(connector, tools.length, invocationCount24h, iconUrlForConnector(connector)),
      command: connector.command,
      args: connector.args,
      url: connector.url,
      secrets: secrets.map((s) => ({ key: s.key, masked: true, last4: maskLast4(s.value) })),
      tools: tools.map((t) => ({
        toolName: t.toolName,
        description: t.description,
        category: t.category,
        permission: t.permission,
      })),
    });
  });

  // GET /:id/activity
  route.get('/:id/activity', (c) => {
    const id = c.req.param('id');
    const connector = deps.connectors.get(id);
    if (!connector) return c.json({ error: 'not_found' }, 404);
    const limit = Math.min(Number(c.req.query('limit') ?? '20') || 20, 100);
    const recent = deps.connectors.recentInvocations(id, limit);
    return c.json(recent);
  });

  // POST /:id/test (installed connector — persists outcome)
  route.post('/:id/test', async (c) => {
    const id = c.req.param('id');
    const connector = deps.connectors.get(id);
    if (!connector) return c.json({ error: 'not_found' }, 404);
    const secrets = deps.connectors.getSecrets(id);
    // Spec 0038 F#2: pass authCheckTool from the catalog entry if this
    // connector was installed from one. Custom connectors get no auth probe.
    // Spec 0040: also pass authCheckArgs.
    let authCheckTool: string | undefined;
    let authCheckArgs: Record<string, unknown> | undefined;
    if (connector.source === 'catalog' && connector.catalogId) {
      const entry = findCatalogEntry(connector.catalogId);
      authCheckTool = entry?.authCheckTool;
      authCheckArgs = entry?.authCheckArgs;
    }
    const result = await discoverTools(
      connector,
      secrets,
      authCheckTool ? { authCheckTool, ...(authCheckArgs ? { authCheckArgs } : {}) } : {},
    );
    if ('error' in result) {
      deps.connectors.update(id, { lastError: result.error, lastErrorAt: nowIso() });
      return c.json({ ok: false, errorKind: result.errorKind, error: result.error });
    }
    deps.connectors.update(id, {
      lastError: null,
      lastErrorAt: null,
      lastVerifiedAt: nowIso(),
    });
    return c.json({ ok: true, tools: result.tools, durationMs: result.durationMs });
  });

  // PATCH /:id (update — enqueues connector_update)
  route.patch('/:id', zValidator('json', patchSchema), (c) => {
    const id = c.req.param('id');
    if (!deps.connectors.get(id)) return c.json({ error: 'not_found' }, 404);
    deps.commands.enqueue({
      type: 'connector_update',
      payload: { id, patch: c.req.valid('json'), secrets: c.req.valid('json').secrets },
      correlationId: randomUUID(),
    });
    return c.body(null, 204);
  });

  // PATCH /:id/toggle (direct write)
  route.patch('/:id/toggle', (c) => {
    const id = c.req.param('id');
    const connector = deps.connectors.get(id);
    if (!connector) return c.json({ error: 'not_found' }, 404);
    if (connector.status === 'pending') {
      return c.json({ error: 'cannot_toggle_pending' }, 409);
    }
    const next: 'enabled' | 'disabled' = connector.status === 'enabled' ? 'disabled' : 'enabled';
    deps.connectors.update(id, { status: next });
    return c.json({ status: next });
  });

  // PATCH /:id/tools/permissions/bulk (BEFORE /:id/tools/:toolName/permission)
  route.patch('/:id/tools/permissions/bulk', zValidator('json', bulkPermissionSchema), (c) => {
    const id = c.req.param('id');
    if (!deps.connectors.get(id)) return c.json({ error: 'not_found' }, 404);
    const { category, permission } = c.req.valid('json');
    const rowsAffected = deps.connectors.setBulkPermission(
      id,
      category as ToolCategory,
      permission as ToolPermission,
    );
    return c.json({ rowsAffected });
  });

  // PATCH /:id/tools/:toolName/permission
  route.patch('/:id/tools/:toolName/permission', zValidator('json', permissionSchema), (c) => {
    const id = c.req.param('id');
    const toolName = c.req.param('toolName');
    if (!deps.connectors.get(id)) return c.json({ error: 'not_found' }, 404);
    const { permission } = c.req.valid('json');
    const ok = deps.connectors.setToolPermission(id, toolName, permission as ToolPermission);
    if (!ok) return c.json({ error: 'tool_not_found' }, 404);
    return c.body(null, 204);
  });

  // POST /:id/refresh-tools (enqueues command)
  route.post('/:id/refresh-tools', (c) => {
    const id = c.req.param('id');
    if (!deps.connectors.get(id)) return c.json({ error: 'not_found' }, 404);
    deps.commands.enqueue({
      type: 'connector_refresh_tools',
      payload: { id },
      correlationId: randomUUID(),
    });
    return c.body(null, 204);
  });

  // DELETE /:id (enqueues uninstall)
  route.delete('/:id', (c) => {
    const id = c.req.param('id');
    if (!deps.connectors.get(id)) return c.json({ error: 'not_found' }, 404);
    deps.commands.enqueue({
      type: 'connector_uninstall',
      payload: { id },
      correlationId: randomUUID(),
    });
    return c.body(null, 204);
  });

  // GET /:id/secrets/:key/reveal (rate-limited + audited)
  route.get('/:id/secrets/:key/reveal', (c) => {
    const id = c.req.param('id');
    const key = c.req.param('key');
    if (!deps.connectors.get(id)) return c.json({ error: 'not_found' }, 404);
    const secrets = deps.connectors.getSecrets(id);
    const secret = secrets.find((s) => s.key === key);
    if (!secret) return c.json({ error: 'secret_not_found' }, 404);
    const wait = rateLimiter.check(id, key);
    if (wait !== null) {
      return c.json({ error: 'rate_limited', retryAfter: wait }, 429);
    }
    rateLimiter.record(id, key);
    // Audit (the log line is captured by the API process's stdout sink which
    // bridges to the dbSink LogRepo).
    process.stdout.write(
      `${JSON.stringify({
        level: 30,
        time: nowIso(),
        service: 'api',
        event: 'connector_secret_revealed',
        connectorId: id,
        key,
      })}\n`,
    );
    return c.json({ value: secret.value });
  });

  return route;
}
