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
import type {
  CommandRepo,
  Connector,
  ConnectorAppRepo,
  ConnectorRepo,
  ConnectorSecret,
  ToolCategory,
  ToolPermission,
} from '@zeno/db/runtime';
import {
  computePemSha256,
  fetchAppMetadata,
  fetchInstallations,
  GitHubAppError,
  looksLikePem,
  signAppJwt,
} from '@zeno/github-app';
import { discoverTools } from '@zeno/mcp-discover';
import { type Context, Hono } from 'hono';
import { z } from 'zod';
import type { ApiWriteMode } from '@/lib/api-mode';
import {
  type CatalogEntry,
  CatalogReadError,
  findCatalogEntry,
  loadCatalog,
  resolveIconPath,
} from '@/lib/catalog-loader';
import {
  type ChannelsCatalog,
  findChannelCatalogEntry,
  loadChannelsCatalog,
} from '@/lib/channels-catalog-loader';
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

// Lowercase + kebab-case for github-app installation names.
// Different from slugify in that it doesn't first lowercase ASCII removal —
// installation names are user-controlled (e.g., "AcmeBooks", "Acme-Hosting")
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
    // Spec 0045: discriminated union — `kind: 'connector'` is REQUIRED so
    // dashboards narrow on the field type-safely.
    kind: 'connector',
    id: connector.id,
    slug: connector.slug,
    displayName: connector.displayName,
    // Spec 2026-05-08: detail pages render the operator-set label.
    instanceLabel: connector.instanceLabel,
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
    // Spec 0044/0045: optional FK so dashboard can render the inherited-app
    // callout on github-app-* detail pages.
    appId: connector.appId,
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

// Spec 0045 + 0048 Q2: aggregate per-installation status into a single App row.
//   'degraded' (amber): refresh failed in the last 1h (App-level transient issue)
//   'error'    (red):   any installation has last_error_at within 24h
//   'mixed'    (gray):  empty installations OR mix of enabled/disabled
//   'active'   (green): all enabled + verified, no recent errors/refresh failures
function computeStatusAggregate(
  installations: Connector[],
  lastRefreshErrorAt: string | null = null,
): 'active' | 'mixed' | 'error' | 'degraded' {
  // Refresh failure within 1h → degraded (transient App-level issue).
  // Spec 0048 Q2: amber pill on App row + detail header.
  if (lastRefreshErrorAt) {
    const ageMs = Date.now() - new Date(lastRefreshErrorAt).getTime();
    if (ageMs >= 0 && ageMs < 60 * 60_000) return 'degraded';
  }
  if (installations.length === 0) return 'mixed';
  // Time-guarded: only RECENT errors flag the App as 'error'. Without this,
  // a single stale `last_error_at` from months ago would keep the App red
  // forever even after every installation recovered. 24h matches the
  // worker's verify cadence (operator has plenty of time to see + act).
  const ERROR_WINDOW_MS = 24 * 60 * 60_000;
  const now = Date.now();
  if (
    installations.some((i) => {
      if (!i.lastError || !i.lastErrorAt) return false;
      const ageMs = now - new Date(i.lastErrorAt).getTime();
      return ageMs >= 0 && ageMs < ERROR_WINDOW_MS;
    })
  ) {
    return 'error';
  }
  if (installations.every((i) => i.status === 'enabled' && i.lastVerifiedAt)) return 'active';
  return 'mixed';
}

function pickLatestVerified(installations: Connector[]): string | null {
  const verifiedTimes = installations
    .map((i) => i.lastVerifiedAt)
    .filter((t): t is string => t !== null);
  if (verifiedTimes.length === 0) return null;
  // ISO timestamps sort lexicographically.
  return verifiedTimes.sort().reverse()[0] ?? null;
}

// Spec 0051: getInstallationEnvVarsInUse helper removed alongside the
// operator-picked envVar field (R3 F1 uniqueness validation no longer
// reachable; nothing reads __GITHUB_ENV_VAR__).

// ─── Schemas ─────────────────────────────────────────────────────────────

// Spec 0044: secrets carry an optional `isPublic` flag that the dashboard uses
// to skip masking on safe-to-display fields (e.g., GitHub App ID).
const apiSecretSchema = z.object({
  key: z.string(),
  value: z.string(),
  isPublic: z.boolean().optional(),
});

const testConnectionSchema = z.object({
  transport: z.enum(['stdio', 'remote']),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  url: z.string().optional(),
  secrets: z.array(apiSecretSchema),
});

const createCatalogSchema = z.object({
  source: z.literal('catalog'),
  catalogId: z.string(),
  secrets: z.array(apiSecretSchema),
  /** Spec 2026-05-08-connectors-cli-first-design Q4: optional operator-supplied
   * label distinguishing instances of the same catalog entry (e.g. multiple Linear
   * workspaces). Drives slug derivation when present. */
  instanceLabel: z.string().min(1).optional(),
  /** Spec 0057: optional discriminator. Defaults to 'mcp'. When 'channel', the install handler resolves the catalog entry from channels-catalog.json (NOT connectors-catalog.json) and synthesizes channel-specific defaults (transport='remote', tools=[]) into the enqueued payload. */
  kind: z.enum(['mcp', 'channel']).optional().default('mcp'),
});

const createCustomSchema = z.object({
  source: z.literal('custom'),
  displayName: z.string().min(1),
  transport: z.enum(['stdio', 'remote']),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  url: z.string().optional(),
  secrets: z.array(apiSecretSchema),
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
  /** Spec 2026-05-08-connectors-cli-first-design Q4: optional operator-supplied
   * label distinguishing instances. Drives slug derivation when present. */
  instanceLabel: z.string().min(1).optional(),
  /** Spec 0057: included for symmetry, but channels only support source='catalog'. The install handler returns 400 channel_must_be_catalog_source if a custom + channel combo is requested. */
  kind: z.enum(['mcp', 'channel']).optional().default('mcp'),
});

const createSchema = z.discriminatedUnion('source', [createCatalogSchema, createCustomSchema]);

const patchSchema = z.object({
  displayName: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  command: z.string().nullable().optional(),
  args: z.array(z.string()).nullable().optional(),
  url: z.string().nullable().optional(),
  secrets: z.array(apiSecretSchema).optional(),
  /** Spec 2026-05-08-connectors-cli-first-design Q4: operators can rename or
   * clear the per-instance label after install. */
  instanceLabel: z.string().min(1).nullable().optional(),
  // Spec 0051: M11's `envVar` field removed (operator-picked envVar customization dropped).
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
  /** Spec 0044: optional ConnectorApp repo enables /catalog/github-app/* endpoints. */
  connectorApps?: ConnectorAppRepo;
  rateLimiter?: SecretRateLimiter;
  /** Spec 2026-05-08-connectors-cli-first-design: gates all mutating endpoints.
   *  When 'cli', mutations return 403 mode_cli_only with the equivalent
   *  `zeno connector ...` command. GET reads stay open in either mode. */
  writes: ApiWriteMode;
}

export function buildConnectorsRoute(deps: ConnectorsRouteDeps): Hono {
  const route = new Hono();
  const rateLimiter = deps.rateLimiter ?? new SecretRateLimiter();

  // Mutation gate. Returns 403 with the equivalent CLI command when the API
  // is in CLI-only mode. Each route checks this before any DB work.
  const blockIfCli = (action: string, cli: string) => (c: Context) =>
    c.json({ error: 'mode_cli_only', action, cli }, 403);

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
    // Spec 0045: also surface customInstallComponent so the dashboard can
    // route to a bespoke install modal (e.g., the github-app M6 component).
    // Re-install logic for github-app: even though the catalog entry says
    // isInstalled (via the connector_apps row's parent), the v2 install
    // endpoint guards against duplicate installs with a 409. The flag here
    // is informational for the catalog grid: github-app should NOT show
    // "installed" while it has 0 connector rows yet (just the App row).
    const installedAppCatalogIds = new Set(
      deps.connectorApps?.list().map((a) => a.catalogId) ?? [],
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
      // For github-app, "installed" tracks the connector_apps row, not connector
      // rows. For everything else, fall back to the connector-row check.
      isInstalled: entry.customInstallComponent
        ? installedAppCatalogIds.has(entry.id)
        : installedCatalogIds.has(entry.id),
      customInstallComponent: entry.customInstallComponent ?? null,
      // Spec 2026-05-08 Q5: surface single/multi-instance marker. Default `true`
      // when the catalog entry doesn't declare it explicitly.
      multiInstance: entry.multiInstance ?? true,
    }));
    return c.json(out);
  });

  // GET /catalog/icons/:filename
  route.get('/catalog/icons/:filename', (c) => {
    const filename = c.req.param('filename');
    // Defensive: only serve files referenced by EITHER catalog (path traversal guard).
    // Spec 0057: combine icons from BOTH the MCP catalog AND the channels catalog
    // so channel icons (e.g. slack.svg) resolve via the same endpoint. Channels
    // and MCP connectors share asset directory `agent/assets/connectors/`.
    // Both loaders are best-effort — missing one shouldn't 500 the other.
    const knownIcons = new Set<string>();
    try {
      const catalog: CatalogEntry[] = loadCatalog();
      for (const entry of catalog) knownIcons.add(entry.icon);
    } catch {
      // MCP catalog missing/malformed — channel icons still work below.
    }
    try {
      const channelsCatalog = loadChannelsCatalog();
      for (const entry of channelsCatalog.entries) knownIcons.add(entry.icon);
    } catch {
      // channels catalog missing/malformed → fall through with MCP-only set.
    }
    if (knownIcons.size === 0) {
      return c.json({ error: 'catalog_unavailable' }, 500);
    }
    if (!knownIcons.has(filename)) return c.json({ error: 'not_found' }, 404);
    const path = resolveIconPath(filename);
    if (!path) return c.json({ error: 'not_found' }, 404);
    // Spec 0066 D: catalog now mixes SVG (slack/github/playwright/linear/
    // sentry) and PNG (klaviyo/swarmia — official brands don't publish
    // public-domain SVG marks). Read raw bytes (not UTF-8) so PNG isn't
    // corrupted, and pick MIME from the extension.
    const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
    const mime =
      ext === '.png'
        ? 'image/png'
        : ext === '.jpg' || ext === '.jpeg'
          ? 'image/jpeg'
          : 'image/svg+xml';
    const body = readFileSync(path);
    return new Response(new Uint8Array(body), {
      status: 200,
      headers: {
        'Content-Type': mime,
        // 5min cache: long enough for perf during a session, short enough
        // that catalog edits propagate without forcing a hard-reload.
        'Cache-Control': 'public, max-age=300',
      },
    });
  });

  // ── Spec 0044: GitHub App v2 endpoints ─────────────────────────────────
  //
  // These STATIC routes MUST come before `/catalog/:id/test` since Hono
  // matches in registration order — without this, `/catalog/github-app/test`
  // would hit the dynamic `:id='github-app'` handler.
  //
  // The v1 endpoint (commit dcfcd2a) created N installation rows in one shot
  // by enqueuing `connector_create` commands; the App PEM was duplicated
  // across each row, and discoverability + lifecycle ops were impossible. v2
  // splits responsibility:
  //   POST /catalog/github-app/test          — validate {appId, pem} (no DB write)
  //   POST /catalog/github-app/install       — sync DB write + async worker bootstrap
  //   POST /catalog/github-app/installations/discover — list installs from GitHub
  //   POST /catalog/github-app/installations  — add 1 installation (creates connector row)
  //   POST /catalog/github-app/uninstall-app  — tear down App + cascade
  //   GET  /catalog/github-app/app            — read installed App metadata
  //
  // Spec 0051 retired POST /catalog/github-app/rotate-pem; PEM rotation is
  // handled via uninstall-app + reinstall.
  //
  // All endpoints require `deps.connectorApps` to be wired (server.ts).

  const githubAppTestSchema = z.object({
    appId: z.string().min(1),
    pem: z
      .string()
      .min(1)
      .refine(looksLikePem, { message: 'pem must be a PEM-formatted private key' }),
  });
  route.post('/catalog/github-app/test', zValidator('json', githubAppTestSchema), async (c) => {
    const body = c.req.valid('json');
    let jwt: string;
    try {
      jwt = signAppJwt({ appId: body.appId, privateKey: body.pem });
    } catch (err) {
      return c.json({
        ok: false,
        errorKind: 'auth' as const,
        error: `pem could not sign a JWT: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
    try {
      const meta = await fetchAppMetadata(jwt);
      if (meta.appId !== body.appId) {
        return c.json({
          ok: false,
          errorKind: 'auth' as const,
          error: `appId mismatch: pem signs JWT for ${meta.appId}, not ${body.appId}`,
        });
      }
      const installations = await fetchInstallations(jwt);
      return c.json({
        ok: true,
        appName: meta.name,
        appSlug: meta.slug,
        installationsAvailable: installations.map((i) => ({
          name: i.account,
          id: i.id,
          accountType: i.accountType,
          repoCount: i.repoCount,
          permissions: i.permissions,
        })),
      });
    } catch (err) {
      const kind = err instanceof GitHubAppError ? err.kind : 'unknown';
      return c.json({
        ok: false,
        errorKind: kind,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  route.post('/catalog/github-app/install', zValidator('json', githubAppTestSchema), async (c) => {
    if (deps.writes === 'cli') {
      return blockIfCli(
        'app_install',
        'zeno connector app install --catalog github-app --app-id <id> --pem-file <path>',
      )(c);
    }
    if (!deps.connectorApps) {
      return c.json({ error: 'connector_apps_repo_not_wired' }, 500);
    }
    const body = c.req.valid('json');

    let jwt: string;
    try {
      jwt = signAppJwt({ appId: body.appId, privateKey: body.pem });
    } catch (err) {
      return c.json({
        ok: false,
        errorKind: 'auth' as const,
        error: `pem could not sign a JWT: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
    let appName: string;
    let appSlug: string;
    try {
      const meta = await fetchAppMetadata(jwt);
      if (meta.appId !== body.appId) {
        return c.json({
          ok: false,
          errorKind: 'auth' as const,
          error: `appId mismatch: pem signs JWT for ${meta.appId}, not ${body.appId}`,
        });
      }
      appName = meta.name;
      appSlug = meta.slug;
    } catch (err) {
      const kind = err instanceof GitHubAppError ? err.kind : 'unknown';
      return c.json({
        ok: false,
        errorKind: kind,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Spec 0045 (R1 F1): single-app enforcement — reject install if ANY
    // connector_apps row already exists with catalog_id='github-app',
    // regardless of appId. The single-app constraint (spec line 113) is
    // stricter than UNIQUE(catalog_id, app_id).
    const existing = deps.connectorApps.getOneByCatalog('github-app');
    if (existing) {
      return c.json(
        {
          ok: false,
          errorKind: 'conflict' as const,
          error: 'app_already_installed',
          existingAppId: existing.appId,
          existingAppName: existing.appName,
        },
        409,
      );
    }

    const created = deps.connectorApps.create({
      catalogId: 'github-app',
      appId: body.appId,
      appSlug,
      appName,
      pem: body.pem,
      pemSha256: computePemSha256(body.pem),
    });

    deps.commands.enqueue({
      type: 'app_install',
      payload: { appUuid: created.id },
      correlationId: randomUUID(),
    });

    return c.json({
      ok: true,
      appUuid: created.id,
      appId: created.appId,
      appName: created.appName,
      appSlug: created.appSlug,
    });
  });

  route.post('/catalog/github-app/installations/discover', async (c) => {
    if (!deps.connectorApps) {
      return c.json({ error: 'connector_apps_repo_not_wired' }, 500);
    }
    const app = deps.connectorApps.getOneByCatalog('github-app');
    if (!app) return c.json({ error: 'app_not_installed' }, 404);
    let jwt: string;
    try {
      jwt = signAppJwt({ appId: app.appId, privateKey: app.pem });
    } catch (err) {
      return c.json({ error: 'pem_invalid', detail: String(err) }, 500);
    }
    try {
      const installs = await fetchInstallations(jwt);
      const wired = new Set(
        deps.connectors
          .list({ source: 'catalog' })
          .filter((c2) => c2.catalogId === 'github-app')
          .map((c2) => {
            const secrets = deps.connectors.getSecrets(c2.id);
            return secrets.find((s) => s.key === '__GITHUB_INSTALLATION_ID__')?.value ?? null;
          })
          .filter((id): id is string => id !== null),
      );
      return c.json({
        installations: installs.map((i) => ({
          id: i.id,
          name: i.account,
          accountType: i.accountType,
          repoCount: i.repoCount,
          permissions: i.permissions,
          alreadyWired: wired.has(i.id),
        })),
      });
    } catch (err) {
      const kind = err instanceof GitHubAppError ? err.kind : 'unknown';
      return c.json({ error: kind, detail: err instanceof Error ? err.message : String(err) }, 502);
    }
  });

  const addInstallationSchema = z.object({
    installationId: z.string().min(1),
    displayName: z.string().min(1),
    // Spec 0051: `envVar` field removed — operator-picked env var customization
    // dropped (the worker authenticates the github-mcp-server subprocess via
    // the fixed GITHUB_PERSONAL_ACCESS_TOKEN env var).
  });
  route.post(
    '/catalog/github-app/installations',
    zValidator('json', addInstallationSchema),
    (c) => {
      if (deps.writes === 'cli') {
        return blockIfCli(
          'app_installation_add',
          'zeno connector app installations add --installation-id <id> --label "<label>"',
        )(c);
      }
      if (!deps.connectorApps) {
        return c.json({ error: 'connector_apps_repo_not_wired' }, 500);
      }
      const body = c.req.valid('json');
      const app = deps.connectorApps.getOneByCatalog('github-app');
      if (!app) return c.json({ error: 'app_not_installed' }, 404);

      const githubAppEntry = findCatalogEntry('github-app');
      if (!githubAppEntry) {
        return c.json({ error: 'github_app_catalog_entry_missing' }, 500);
      }
      // Spec 0045: copy tools from the `github` (Personal) catalog entry —
      // both Personal and App use the same github-mcp-server, so they expose
      // the same 51 tools. The `github-app` catalog entry's tools[] is empty
      // by design (the install modal builds installation rows individually).
      const githubEntry = findCatalogEntry('github');
      if (!githubEntry) {
        return c.json({ error: 'github_catalog_entry_missing' }, 500);
      }

      // Spec 0051: env_var_in_use 409 + getInstallationEnvVarsInUse helper
      // removed alongside the operator-picked envVar field.

      const slug = resolveSlugCollision(
        deps.connectors,
        `github-app-${kebabLower(body.displayName)}`,
      );
      const payload = {
        source: 'catalog' as const,
        catalogId: 'github-app',
        slug,
        displayName: `GitHub App — ${body.displayName}`,
        description: githubAppEntry.description,
        transport: githubAppEntry.transport,
        command: githubAppEntry.transportConfig.command ?? null,
        args: githubAppEntry.transportConfig.args ?? null,
        url: githubAppEntry.transportConfig.url ?? null,
        secrets: [
          { key: '__GITHUB_INSTALLATION_ID__', value: body.installationId },
          { key: '__GITHUB_INSTALLATION_NAME__', value: body.displayName },
        ],
        // Spec 0045: tools sourced from the `github` (Personal) catalog entry,
        // not from `github-app`'s empty array.
        tools: githubEntry.tools.map((t) => ({
          toolName: t.name,
          description: t.description,
          category: t.category,
          permission: t.defaultPermission,
        })),
        appId: app.id,
      };
      const correlationId = randomUUID();
      deps.commands.enqueue({
        type: 'connector_create',
        payload,
        correlationId,
      });
      return c.json({ correlationId, slug }, 202);
    },
  );

  // Spec 0051: rotate-PEM endpoint removed. Operators rotate PEMs by
  // uninstalling the App and reinstalling it with the new private key (a
  // rare event; the cost of re-creating per-tool permissions is acceptable
  // given the maintenance burden of a separate rotation flow).

  // Spec 0046 supersedes spec 0044 §API-Endpoints body shape: confirmAppName
  // (not confirmAppId) — the dashboard M12 modal uses italic-gold app NAME for
  // the type-to-confirm gesture, not the numeric App ID.
  const uninstallAppSchema = z.object({ confirmAppName: z.string().min(1) });
  route.post('/catalog/github-app/uninstall-app', zValidator('json', uninstallAppSchema), (c) => {
    if (deps.writes === 'cli') {
      return blockIfCli('app_uninstall', 'zeno connector app uninstall --confirm "<app-name>"')(c);
    }
    if (!deps.connectorApps) {
      return c.json({ error: 'connector_apps_repo_not_wired' }, 500);
    }
    const body = c.req.valid('json');
    const app = deps.connectorApps.getOneByCatalog('github-app');
    if (!app) return c.json({ error: 'app_not_installed' }, 404);
    if (body.confirmAppName !== app.appName) {
      return c.json({ error: 'confirm_app_name_mismatch' }, 400);
    }
    deps.connectorApps.delete(app.id);
    const correlationId = randomUUID();
    deps.commands.enqueue({
      type: 'app_uninstall',
      payload: { appUuid: app.id },
      correlationId,
    });
    return c.json({ correlationId }, 202);
  });

  route.get('/catalog/github-app/app', (c) => {
    if (!deps.connectorApps) {
      return c.json({ error: 'connector_apps_repo_not_wired' }, 500);
    }
    const app = deps.connectorApps.getOneByCatalog('github-app');
    if (!app) return c.json({ error: 'app_not_installed' }, 404);
    return c.json({
      appUuid: app.id,
      appId: app.appId,
      appName: app.appName,
      appSlug: app.appSlug,
      pemSha256: app.pemSha256,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
    });
  });

  // POST /catalog/:id/test (resolves transportConfig server-side; for catalog installs)
  // MUST be registered AFTER the github-app static routes above.
  route.post('/catalog/:id/test', async (c) => {
    if (deps.writes === 'cli') {
      return blockIfCli('test_transient', 'zeno connector test <catalog-id>')(c);
    }
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
      instanceLabel: null,
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
      appId: null,
      kind: 'mcp',
    };
    const secrets: ConnectorSecret[] = (body.secrets ?? []).map((s) => ({
      connectorId: 'transient',
      key: s.key,
      value: s.value,
    }));
    // Spec 0038 F#2: pass authCheckTool from the catalog entry so the
    // test endpoint actually validates credentials (not just tools/list).
    // Spec 0040: also pass authCheckArgs for MCPs requiring non-empty input.
    // Spec 0048 Q1: also pass categoryPrefixMap for MCPs with namespaced tools.
    const result = await discoverTools(transient, secrets, {
      ...(entry.authCheckTool ? { authCheckTool: entry.authCheckTool } : {}),
      ...(entry.authCheckArgs ? { authCheckArgs: entry.authCheckArgs } : {}),
      ...(entry.categoryPrefixMap ? { categoryPrefixMap: entry.categoryPrefixMap } : {}),
    });
    if ('error' in result) {
      return c.json({ ok: false, errorKind: result.errorKind, error: result.error });
    }
    return c.json({ ok: true, tools: result.tools, durationMs: result.durationMs });
  });

  // POST /test (transient — not yet saved)
  route.post('/test', zValidator('json', testConnectionSchema), async (c) => {
    if (deps.writes === 'cli') {
      return blockIfCli('test_transient', 'zeno connector test <catalog-id>')(c);
    }
    const body = c.req.valid('json');
    const transient: Connector = {
      id: 'transient',
      slug: 'transient',
      displayName: 'Transient',
      instanceLabel: null,
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
      appId: null,
      kind: 'mcp',
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

  // GET / (list) — Spec 0045: returns a discriminated union of
  // ConnectorListItem (existing rows, kind='connector') and AppListItem
  // (collapsed App rows for github-app, kind='app'). The 4 github-app-*
  // connectors are NOT returned individually at the top level — they appear
  // nested inside the parent AppListItem.
  route.get('/', (c) => {
    // Spec 0057: filter to kind='mcp' so channel rows (Slack et al.) don't
    // leak into the MCP connectors list. Channel rows are served by GET /api/channels.
    const all = deps.connectors.list({ kind: 'mcp' });
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Partition: connectors with appId set are nested inside an App row;
    // others are emitted as standalone ConnectorListItems.
    const connectorsByAppId = new Map<string, Connector[]>();
    const standalone: Connector[] = [];
    for (const connector of all) {
      if (connector.appId) {
        const existing = connectorsByAppId.get(connector.appId) ?? [];
        existing.push(connector);
        connectorsByAppId.set(connector.appId, existing);
      } else {
        standalone.push(connector);
      }
    }

    // Spec 2026-05-08 Q2 + Q5: standalone catalog rows are bucketed by
    // catalog_id. Multiple instances of the same plain catalog (e.g., 3 Linear
    // workspaces) collapse into a single `connector_group` with nested
    // installations; single-instance catalogs continue to emit `kind:'connector'`.
    // Custom rows (no catalogId) NEVER collapse — operators name customs explicitly.
    const standaloneByCatalog = new Map<string, Connector[]>();
    for (const connector of standalone) {
      const key =
        connector.source === 'catalog' && connector.catalogId
          ? connector.catalogId
          : `__custom__:${connector.id}`;
      const existing = standaloneByCatalog.get(key) ?? [];
      existing.push(connector);
      standaloneByCatalog.set(key, existing);
    }

    const items: Array<Record<string, unknown>> = [];
    for (const [key, group] of standaloneByCatalog.entries()) {
      const isCustomBucket = key.startsWith('__custom__:');
      if (isCustomBucket || group.length === 1) {
        // Single-instance catalog OR a custom row: emit standalone connector.
        for (const connector of group) {
          const tools = deps.connectors.getTools(connector.id);
          const invocations = deps.connectors.countInvocationsSince(connector.id, cutoff);
          items.push(
            buildListItem(connector, tools.length, invocations, iconUrlForConnector(connector)),
          );
        }
        continue;
      }
      // Multi-instance plain catalog → connector_group.
      const sample = group[0]!;
      const catalogId = key;
      const iconUrl = iconUrlForConnector(sample);
      items.push({
        kind: 'connector_group',
        catalogId,
        name: findCatalogEntry(catalogId)?.name ?? sample.displayName,
        iconUrl,
        installationCount: group.length,
        statusAggregate: computeStatusAggregate(group),
        lastVerifiedAt: pickLatestVerified(group),
        installations: group.map((cn) => ({
          connectorId: cn.id,
          slug: cn.slug,
          displayName: cn.displayName,
          instanceLabel: cn.instanceLabel,
          status: cn.status,
          lastVerifiedAt: cn.lastVerifiedAt,
          lastError: cn.lastError,
          lastErrorAt: cn.lastErrorAt,
        })),
      });
    }

    // Build AppListItems by joining connector_apps + nested connectors.
    if (deps.connectorApps) {
      for (const app of deps.connectorApps.list()) {
        const installations = connectorsByAppId.get(app.id) ?? [];
        const githubEntry = (() => {
          try {
            return findCatalogEntry('github');
          } catch {
            return null;
          }
        })();
        const iconUrl = githubEntry ? `/api/connectors/catalog/icons/${githubEntry.icon}` : null;
        items.push({
          kind: 'app',
          appUuid: app.id,
          appId: app.appId,
          catalogId: app.catalogId,
          appName: app.appName,
          appSlug: app.appSlug,
          iconUrl,
          installationCount: installations.length,
          statusAggregate: computeStatusAggregate(installations, app.lastRefreshErrorAt),
          lastVerifiedAt: pickLatestVerified(installations),
          // Spec 0048 Q2: surface refresh-failure for the dashboard.
          lastRefreshErrorAt: app.lastRefreshErrorAt,
          lastRefreshErrorMessage: app.lastRefreshErrorMessage,
          installations: installations.map((i) => ({
            connectorId: i.id,
            slug: i.slug,
            displayName: i.displayName,
            status: i.status,
            lastVerifiedAt: i.lastVerifiedAt,
            lastError: i.lastError,
            lastErrorAt: i.lastErrorAt,
          })),
        });
      }
    }

    return c.json(items);
  });

  // POST / (create — enqueues command)
  route.post('/', zValidator('json', createSchema), (c) => {
    if (deps.writes === 'cli') {
      return blockIfCli('install', 'zeno connector install <catalog-id> --label "<label>"')(c);
    }
    const body = c.req.valid('json');

    // Spec 0057: validate kind+source combination upfront. Channels are
    // catalog-only (no custom channels in this version). Without this
    // pre-check, a `source: 'custom' + kind: 'channel'` payload would slip
    // through the discriminated union and silently land kind='mcp' in the DB
    // (since the custom branch doesn't look at the channels catalog).
    if (body.source === 'custom' && body.kind === 'channel') {
      return c.json(
        {
          error: 'channel_must_be_catalog_source',
          message: 'Channels only support source: catalog. Custom channels are not supported.',
        },
        400,
      );
    }

    let payload: Record<string, unknown>;
    if (body.source === 'catalog') {
      // Spec 0057: branch on kind BEFORE catalog lookup. Channels resolve
      // their entry from channels-catalog.json (NOT connectors-catalog.json)
      // and synthesize all channel-specific defaults at the API route, so the
      // worker handler validates a fully-shaped catalogSchema payload.
      if (body.kind === 'channel') {
        let channelsCatalog: ChannelsCatalog;
        try {
          channelsCatalog = loadChannelsCatalog();
        } catch {
          return c.json({ error: 'channels_catalog_unavailable' }, 500);
        }
        const channelEntry = findChannelCatalogEntry(channelsCatalog, body.catalogId);
        if (!channelEntry) return c.json({ error: 'channel_catalog_entry_not_found' }, 404);
        // Validate required secrets are all present in the payload.
        const submitted = new Map(body.secrets.map((s) => [s.key, s.value]));
        for (const sec of channelEntry.secrets.filter((s) => s.required)) {
          if (!submitted.has(sec.key)) {
            return c.json({ error: 'missing_required_secret', key: sec.key }, 400);
          }
        }
        // Spec 2026-05-08-connectors-cli-first-design: channels are stricter —
        // ignore any operator-supplied instanceLabel and force null so DB rows
        // for slack/etc. don't carry per-instance labels.
        const slug = resolveSlugCollision(deps.connectors, channelEntry.id);
        payload = {
          source: 'catalog',
          catalogId: channelEntry.id,
          slug,
          displayName: channelEntry.name,
          instanceLabel: null,
          description: channelEntry.description,
          transport: 'remote', // placeholder per spec 0057 (channel rows don't spawn MCP servers)
          command: null,
          args: null,
          url: null,
          secrets: body.secrets,
          tools: [], // channels have no MCP tools
          kind: 'channel',
        };
      } else {
        const entry = findCatalogEntry(body.catalogId);
        if (!entry) return c.json({ error: 'catalog_entry_not_found' }, 404);
        // Use the catalog id as the slug; it's already kebab-case + unique within the catalog.
        // Spec 2026-05-08-connectors-cli-first-design Q4: when the operator
        // supplies an instanceLabel (multiple Linear workspaces, etc.), kebab
        // it onto the slug base BEFORE collision resolution so the resulting
        // slug is human-readable (e.g. linear-acme-workspace) and only falls
        // back to numeric -2/-3 suffixes when two installs share a label.
        const slug = body.instanceLabel
          ? resolveSlugCollision(deps.connectors, `${entry.id}-${kebabLower(body.instanceLabel)}`)
          : resolveSlugCollision(deps.connectors, entry.id);
        payload = {
          source: 'catalog',
          catalogId: entry.id,
          slug,
          displayName: entry.name,
          instanceLabel: body.instanceLabel ?? null,
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
          kind: 'mcp',
        };
      }
    } else {
      // Spec 2026-05-08-connectors-cli-first-design Q4: custom connectors also
      // accept an optional label; when provided, append the kebab-cased label
      // to the slug base so two custom connectors with the same displayName
      // but different labels get distinguishable slugs without numeric suffixes.
      const slugBase = body.instanceLabel
        ? `${slugify(body.displayName)}-${kebabLower(body.instanceLabel)}`
        : slugify(body.displayName);
      const slug = resolveSlugCollision(deps.connectors, slugBase);
      payload = {
        source: 'custom',
        slug,
        displayName: body.displayName,
        instanceLabel: body.instanceLabel ?? null,
        transport: body.transport,
        command: body.command ?? null,
        args: body.args ?? null,
        url: body.url ?? null,
        secrets: body.secrets,
        tools: body.tools ?? [],
        kind: 'mcp',
      };
    }
    const correlationId = randomUUID();
    deps.commands.enqueue({
      type: 'connector_create',
      payload,
      correlationId,
    });
    return c.json({ correlationId }, 202);
  });

  // GET /apps/:appUuid — Spec 0045: rich App detail for the dashboard's
  // C8 page. MUST be registered BEFORE the dynamic `:id` route below
  // (Hono matches in registration order; static segments come first).
  route.get('/apps/:appUuid', (c) => {
    if (!deps.connectorApps) {
      return c.json({ error: 'connector_apps_repo_not_wired' }, 500);
    }
    const appUuid = c.req.param('appUuid');
    const app = deps.connectorApps.get(appUuid);
    if (!app) return c.json({ error: 'not_found' }, 404);
    const installations = deps.connectors
      .list({ source: 'catalog' })
      .filter((cn) => cn.appId === app.id)
      .map((cn) => {
        const secrets = deps.connectors.getSecrets(cn.id);
        const map = new Map(secrets.map((s) => [s.key, s.value]));
        const tools = deps.connectors.getTools(cn.id);
        return {
          connectorId: cn.id,
          slug: cn.slug,
          displayName: cn.displayName,
          installationId: map.get('__GITHUB_INSTALLATION_ID__') ?? null,
          status: cn.status,
          lastVerifiedAt: cn.lastVerifiedAt,
          lastError: cn.lastError,
          lastErrorAt: cn.lastErrorAt,
          toolCount: tools.length,
        };
      });
    return c.json({
      app: {
        id: app.id,
        appId: app.appId,
        catalogId: app.catalogId,
        appName: app.appName,
        appSlug: app.appSlug,
        pemSha256: app.pemSha256,
        createdAt: app.createdAt,
        updatedAt: app.updatedAt,
        // Spec 0048 Q2: surface refresh failure for the C8 detail page header.
        lastRefreshErrorAt: app.lastRefreshErrorAt,
        lastRefreshErrorMessage: app.lastRefreshErrorMessage,
      },
      installations,
    });
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
    if (deps.writes === 'cli') {
      return blockIfCli('test', 'zeno connector test <slug>')(c);
    }
    const id = c.req.param('id');
    const connector = deps.connectors.get(id);
    if (!connector) return c.json({ error: 'not_found' }, 404);
    const secrets = deps.connectors.getSecrets(id);
    // Spec 0038 F#2: pass authCheckTool from the catalog entry if this
    // connector was installed from one. Custom connectors get no auth probe.
    // Spec 0040: also pass authCheckArgs.
    // Spec 0048 Q1: also pass categoryPrefixMap.
    let authCheckTool: string | undefined;
    let authCheckArgs: Record<string, unknown> | undefined;
    let categoryPrefixMap: Record<string, ToolCategory> | undefined;
    if (connector.source === 'catalog' && connector.catalogId) {
      const entry = findCatalogEntry(connector.catalogId);
      authCheckTool = entry?.authCheckTool;
      authCheckArgs = entry?.authCheckArgs;
      categoryPrefixMap = entry?.categoryPrefixMap;
    }
    const result = await discoverTools(connector, secrets, {
      ...(authCheckTool ? { authCheckTool } : {}),
      ...(authCheckArgs ? { authCheckArgs } : {}),
      ...(categoryPrefixMap ? { categoryPrefixMap } : {}),
    });
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
  // Spec 0051: M11 envVar translation block + R3 F1 collision check removed
  // alongside the operator-picked envVar field.
  route.patch('/:id', zValidator('json', patchSchema), (c) => {
    if (deps.writes === 'cli') {
      return blockIfCli('update', 'zeno connector secret set <slug> <key>')(c);
    }
    const id = c.req.param('id');
    const connector = deps.connectors.get(id);
    if (!connector) return c.json({ error: 'not_found' }, 404);
    const body = c.req.valid('json');
    const correlationId = randomUUID();
    deps.commands.enqueue({
      type: 'connector_update',
      payload: { id, patch: body, secrets: body.secrets },
      correlationId,
    });
    return c.json({ correlationId }, 202);
  });

  // PATCH /:id/toggle (direct write)
  route.patch('/:id/toggle', (c) => {
    if (deps.writes === 'cli') {
      return blockIfCli('enable_disable', 'zeno connector enable <slug>')(c);
    }
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
    if (deps.writes === 'cli') {
      return blockIfCli(
        'tool_permission_bulk',
        'zeno connector tool bulk <slug> --category <cat> --permission <perm>',
      )(c);
    }
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
    if (deps.writes === 'cli') {
      return blockIfCli('tool_permission', 'zeno connector tool set <slug> <tool> <permission>')(c);
    }
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
    if (deps.writes === 'cli') {
      return blockIfCli('refresh_tools', 'zeno connector refresh-tools <slug>')(c);
    }
    const id = c.req.param('id');
    if (!deps.connectors.get(id)) return c.json({ error: 'not_found' }, 404);
    const correlationId = randomUUID();
    deps.commands.enqueue({
      type: 'connector_refresh_tools',
      payload: { id },
      correlationId,
    });
    return c.json({ correlationId }, 202);
  });

  // DELETE /:id (enqueues uninstall)
  route.delete('/:id', (c) => {
    if (deps.writes === 'cli') {
      return blockIfCli('uninstall', 'zeno connector uninstall <slug> --yes')(c);
    }
    const id = c.req.param('id');
    if (!deps.connectors.get(id)) return c.json({ error: 'not_found' }, 404);
    const correlationId = randomUUID();
    deps.commands.enqueue({
      type: 'connector_uninstall',
      payload: { id },
      correlationId,
    });
    return c.json({ correlationId }, 202);
  });

  // GET /:id/secrets/:key/reveal (rate-limited + audited)
  // Although HTTP-method GET, this endpoint has side effects (rate-limit
  // counter + audit log) and exposes plaintext, so it is gated as a mutation.
  route.get('/:id/secrets/:key/reveal', (c) => {
    if (deps.writes === 'cli') {
      return blockIfCli('reveal_secret', 'zeno connector secret reveal <slug> <key>')(c);
    }
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
