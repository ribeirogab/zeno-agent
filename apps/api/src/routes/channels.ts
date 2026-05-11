/**
 * Spec 0057: channels routes. Mirrors the connectors routes shape but for
 * channel transports (Slack et al.). Storage is shared (`connectors` table
 * with kind='channel'); UI presentation is separate.
 *
 * Static segments must precede dynamic ones per the existing convention
 * (see top of `connectors.ts`).
 *
 * Endpoints (spec 0057):
 *   - GET /catalog → list of channels-catalog entries (read-only)
 *   - GET /        → list of installed channels (connectors rows kind='channel')
 *
 * Endpoints (spec 0059):
 *   - GET /:id                       → channel detail (channel-shape)
 *   - PATCH /:id/secrets             → sync direct DB write (mode: merge | replace)
 *   - DELETE /:id                    → sync direct DB delete (FK CASCADE)
 *   - GET /catalog/setup/:catalogId  → install-time setup helper { steps, manifest }
 *
 * Install reuses the existing `/api/connectors` POST endpoint; the `kind`
 * field on the install payload routes the request through the channel branch
 * in `connectors.ts:POST /`.
 */

import { zValidator } from '@hono/zod-validator';
import type { ConnectorRepo } from '@zeno/db/runtime';
import { Hono } from 'hono';
import { z } from 'zod';
import type { ApiWriteMode } from '@/lib/api-mode';
import { blockIfCli } from '@/lib/block-if-cli';
import { getChannelSetupHelper } from '@/lib/channel-setup-helpers';
import { runTestStrategy } from '@/lib/channel-test-strategies';
import type { ChannelsCatalog } from '@/lib/channels-catalog-loader';

export interface BuildChannelsRouteDeps {
  connectors: ConnectorRepo;
  channelsCatalog: ChannelsCatalog;
  /**
   * Spec 2026-05-11: mutating channel routes (`PATCH /:slug/secrets`, `DELETE /:slug`,
   * `POST /:slug/test`) return 403 mode_cli_only when this is `'cli'` and the caller
   * does not send `X-Zeno-Origin: cli`. GET reads are unrestricted in either mode.
   */
  writes: ApiWriteMode;
  /**
   * Spec 2026-05-11: injected fetch for `POST /:slug/test`. Tests pass a mock; production
   * uses the global fetch. Threaded through `runTestStrategy` so strategies can hit upstream
   * APIs (Slack `auth.test`, etc.) without coupling the route to any particular SDK.
   */
  fetchImpl?: typeof fetch;
}

/**
 * Spec 0059: PATCH /:id/secrets body schema.
 *
 * `mode` defaults to 'merge' so the UI can submit only changed keys without
 * losing unchanged ones. `replace` is for programmatic clients that want a
 * wipe-and-replace. The route handler reads existing secrets and overlays
 * the submitted ones (matching by key) before calling replaceSecrets().
 */
const patchSecretsSchema = z.object({
  mode: z.enum(['merge', 'replace']).optional().default('merge'),
  secrets: z.array(
    z.object({
      key: z.string().min(1),
      value: z.string().min(1),
    }),
  ),
});

export function buildChannelsRoute(deps: BuildChannelsRouteDeps): Hono {
  const route = new Hono();

  // GET /catalog — read-only directory of installable channels.
  // Static segment registered BEFORE GET / per Hono ordering convention.
  route.get('/catalog', (c) => {
    const entries = deps.channelsCatalog.entries.map((e) => ({
      id: e.id,
      slug: e.slug,
      name: e.name,
      description: e.description,
      icon: e.icon,
      iconUrl: `/api/connectors/catalog/icons/${e.icon}`,
      docsUrl: e.docsUrl,
      transport: e.transport,
      fields: e.fields.map((f) => ({
        key: f.key,
        label: f.label,
        help: f.help,
        required: f.required,
        public: f.public,
        inputType: f.inputType ?? (f.public ? 'text' : 'password'),
      })),
    }));
    return c.json({ channels: entries });
  });

  // GET / — installed channels (rows in connectors table with kind='channel').
  // Projection is intentionally narrower than `Connector` to keep the response
  // self-documenting (no leaky placeholders like `transport: 'remote'`).
  route.get('/', (c) => {
    const rows = deps.connectors.listByKind('channel');
    const projected = rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      displayName: r.displayName,
      description: r.description,
      status: r.status,
      lastError: r.lastError,
      lastErrorAt: r.lastErrorAt,
      lastVerifiedAt: r.lastVerifiedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      catalogId: r.catalogId,
    }));
    return c.json(projected);
  });

  // Spec 0059: setup helper. Static path — must come BEFORE GET /:id.
  // Returns { steps, manifest } where manifest is the contents of
  // infra/slack-app-manifest.json (or null for catalog entries without a
  // manifest, e.g. Telegram/WhatsApp when they land).
  route.get('/catalog/setup/:catalogId', (c) => {
    const catalogId = c.req.param('catalogId');
    const helper = getChannelSetupHelper(catalogId);
    if (!helper) {
      return c.json({ error: 'catalog_entry_not_found' }, 404);
    }
    return c.json(helper);
  });

  // Spec 0059: channel detail. Returns 404 for kind=mcp rows or unknown ids
  // (defense in depth — never expose MCP rows via the channels endpoints).
  route.get('/:id', (c) => {
    const id = c.req.param('id');
    const row = deps.connectors.get(id);
    if (!row || row.kind !== 'channel') {
      return c.json({ error: 'channel_not_found' }, 404);
    }
    const secrets = deps.connectors.getSecrets(id);
    const catalogEntry = deps.channelsCatalog.entries.find((e) => e.id === row.catalogId);
    return c.json({
      id: row.id,
      slug: row.slug,
      catalogId: row.catalogId,
      displayName: row.displayName,
      description: row.description,
      status: row.status,
      lastError: row.lastError,
      lastErrorAt: row.lastErrorAt,
      lastVerifiedAt: row.lastVerifiedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      iconUrl: catalogEntry ? `/api/connectors/catalog/icons/${catalogEntry.icon}` : null,
      // Spec 2026-05-11: public fields render unmasked (e.g. dm_owner_user_id) so the CLI
      // and dashboard can display them without a second catalog round-trip; secret fields
      // ship masked with `last4`. `isPublic` lets the caller distinguish without re-parsing
      // the catalog.
      secrets: secrets.map((s) => ({
        key: s.key,
        isPublic: s.isPublic,
        masked: !s.isPublic,
        ...(s.isPublic ? { value: s.value } : { last4: s.value.slice(-4) }),
      })),
    });
  });

  // Spec 0059: PATCH /:id/secrets — sync direct DB write.
  // Spec 2026-05-11: gated by `ZENO_API_WRITES`; handler reads the catalog at request
  // time so `connector_secrets.is_public` reflects each field's catalog declaration
  // (no client-supplied flag — source of truth is the catalog).
  route.patch('/:id/secrets', zValidator('json', patchSecretsSchema), (c) => {
    const blocked = blockIfCli(c, {
      writes: deps.writes,
      action: 'rotate',
      cli: 'zeno channel rotate <slug>',
    });
    if (blocked) return blocked;

    const id = c.req.param('id');
    const row = deps.connectors.get(id);
    if (!row || row.kind !== 'channel') {
      return c.json({ error: 'channel_not_found' }, 404);
    }
    const { mode, secrets: submitted } = c.req.valid('json');

    // Spec 2026-05-11: when mode='replace', every catalog field with required=true must be
    // present in the submission. mode='merge' overlays onto existing, so only the keys the
    // CLI explicitly sent are touched; required-field validation does not apply on merge.
    if (mode === 'replace') {
      const submittedKeys = new Set(submitted.map((s) => s.key));
      const missing: string[] = [];
      for (const field of deps.channelsCatalog.entries
        .find((e) => e.id === row.catalogId)
        ?.fields.filter((f) => f.required) ?? []) {
        if (!submittedKeys.has(field.key)) missing.push(field.key);
      }
      if (missing.length > 0) {
        return c.json({ error: 'missing_required_secrets', keys: missing }, 400);
      }
    }

    let finalSecrets: Array<{ key: string; value: string }>;
    if (mode === 'replace') {
      finalSecrets = submitted;
    } else {
      // mode === 'merge': overlay submitted onto existing, keyed by key.
      // Plaintext lookup is local — never leaves this handler.
      const existing = deps.connectors.getSecrets(id);
      const merged = new Map<string, string>();
      for (const s of existing) merged.set(s.key, s.value);
      for (const s of submitted) merged.set(s.key, s.value);
      finalSecrets = Array.from(merged, ([key, value]) => ({ key, value }));
    }

    // Spec 2026-05-11: thread `isPublic` from the catalog field into the secret row so the
    // GET /:slug projection knows what to unmask. Unknown keys fall through as private.
    const enriched = finalSecrets.map((s) => ({
      key: s.key,
      value: s.value,
      isPublic: deps.channelsCatalog.findField(row.catalogId, s.key)?.public ?? false,
    }));

    deps.connectors.replaceSecrets(id, enriched);
    return c.body(null, 204);
  });

  // Spec 2026-05-11: POST /:id/test — synchronous probe via catalog-declared strategy.
  // Gated because it writes lastVerifiedAt / lastError on the connector row.
  // The dashboard never calls this route; operator must run `zeno channel test <slug>`.
  route.post('/:id/test', (c) => {
    const blocked = blockIfCli(c, {
      writes: deps.writes,
      action: 'test',
      cli: 'zeno channel test <slug>',
    });
    if (blocked) return blocked;

    const id = c.req.param('id');
    const row = deps.connectors.get(id);
    if (!row || row.kind !== 'channel') {
      return c.json({ error: 'channel_not_found' }, 404);
    }
    const catalogEntry = deps.channelsCatalog.entries.find((e) => e.id === row.catalogId);
    if (!catalogEntry) {
      return c.json({ error: 'catalog_entry_missing' }, 500);
    }

    // Decrypt every stored secret + bundle into the probe ctx. The plaintext never
    // leaves this handler — `runTestStrategy` reads what it needs and returns.
    const secretsList = deps.connectors.getSecrets(id);
    const fields: Record<string, string> = {};
    for (const s of secretsList) fields[s.key] = s.value;

    return runTestStrategy(catalogEntry.testStrategy, {
      fields,
      ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
    }).then((result) => {
      if (result.status === 'passed') {
        deps.connectors.update(id, {
          lastVerifiedAt: new Date().toISOString(),
          lastError: null,
          lastErrorAt: null,
        });
      } else {
        deps.connectors.update(id, {
          lastError: result.error ?? 'unknown',
          lastErrorAt: new Date().toISOString(),
        });
      }
      return c.json(result, 200);
    });
  });

  // Spec 0059: DELETE /:id — sync direct DB delete.
  // Spec 2026-05-11: gated by `ZENO_API_WRITES`.
  // FK CASCADE on connector_secrets.connector_id (migration 5) drops secrets
  // in the same transaction. The connectors `connector_uninstall` command-queue
  // path exists for MCP servers that need spawn cleanup; channels don't.
  route.delete('/:id', (c) => {
    const blocked = blockIfCli(c, {
      writes: deps.writes,
      action: 'uninstall',
      cli: 'zeno channel uninstall <slug> --yes',
    });
    if (blocked) return blocked;

    const id = c.req.param('id');
    const row = deps.connectors.get(id);
    if (!row || row.kind !== 'channel') {
      return c.json({ error: 'channel_not_found' }, 404);
    }
    deps.connectors.delete(id);
    return c.body(null, 204);
  });

  return route;
}
