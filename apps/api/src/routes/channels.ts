/**
 * Spec 0057: channels routes. Mirrors the connectors routes shape but for
 * channel transports (Slack et al.). Storage is shared (`connectors` table
 * with kind='channel'); UI presentation is separate.
 *
 * Static segments must precede dynamic ones per the existing convention
 * (see top of `connectors.ts`).
 *
 * Endpoints:
 *   - GET /catalog → list of channels-catalog entries (read-only)
 *   - GET /        → list of installed channels (connectors rows kind='channel')
 *
 * Install/patch/delete reuse the existing `/api/connectors` endpoints; the
 * `kind` field on the install payload routes the request through the channel
 * branch in `connectors.ts:POST /`.
 */

import type { ConnectorRepo } from '@zeno/storage';
import { Hono } from 'hono';
import type { ChannelsCatalog } from '@/lib/channels-catalog-loader';

export interface BuildChannelsRouteDeps {
  connectors: ConnectorRepo;
  channelsCatalog: ChannelsCatalog;
}

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

  return route;
}
