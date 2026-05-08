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
import { getChannelSetupHelper } from '@/lib/channel-setup-helpers';
import type { ChannelsCatalog } from '@/lib/channels-catalog-loader';

export interface BuildChannelsRouteDeps {
  connectors: ConnectorRepo;
  channelsCatalog: ChannelsCatalog;
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
      secrets: e.secrets.map((s) => ({
        key: s.key,
        label: s.label,
        help: s.help,
        required: s.required,
        inputType: s.inputType ?? 'password',
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
      secrets: secrets.map((s) => ({
        key: s.key,
        masked: true as const,
        last4: s.value.slice(-4),
      })),
    });
  });

  // Spec 0059: PATCH /:id/secrets — sync direct DB write.
  // Channels don't need MCP-server-restart side-effects (secrets are read at
  // next worker boot), so the connectors `connector_update` command-queue
  // path doesn't apply.
  route.patch('/:id/secrets', zValidator('json', patchSecretsSchema), (c) => {
    const id = c.req.param('id');
    const row = deps.connectors.get(id);
    if (!row || row.kind !== 'channel') {
      return c.json({ error: 'channel_not_found' }, 404);
    }
    const { mode, secrets: submitted } = c.req.valid('json');

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

    deps.connectors.replaceSecrets(id, finalSecrets);
    return c.body(null, 204);
  });

  // Spec 0059: DELETE /:id — sync direct DB delete.
  // FK CASCADE on connector_secrets.connector_id (migration 5) drops secrets
  // in the same transaction. The connectors `connector_uninstall` command-queue
  // path exists for MCP servers that need spawn cleanup; channels don't.
  route.delete('/:id', (c) => {
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
