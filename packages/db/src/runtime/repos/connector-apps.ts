/**
 * `connector_apps` repository — one row per (catalog_id, app_id).
 * Spec 0044.
 */

import { randomUUID } from 'node:crypto';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { RuntimeDB } from '../db.js';
import { connectorApps } from '../schema.js';

export interface ConnectorApp {
  id: string;
  catalogId: string;
  appId: string;
  appSlug: string;
  appName: string;
  pem: string;
  pemSha256: string;
  createdAt: string;
  updatedAt: string;
  /** Spec 0048 Q2: ISO timestamp of the most recent refresh failure (null on success). */
  lastRefreshErrorAt: string | null;
  /** Spec 0048 Q2: brief error message from the most recent failure (null on success). */
  lastRefreshErrorMessage: string | null;
}

export interface CreateConnectorAppInput {
  id?: string;
  catalogId: string;
  appId: string;
  appSlug: string;
  appName: string;
  pem: string;
  pemSha256: string;
}

export interface UpdateConnectorAppInput {
  appSlug?: string;
  appName?: string;
  pem?: string;
  pemSha256?: string;
  lastRefreshErrorAt?: string | null;
  lastRefreshErrorMessage?: string | null;
}

type Row = typeof connectorApps.$inferSelect;

function rowToApp(row: Row): ConnectorApp {
  // Spec 0051: pem_rotated_at column persists as legacy but is no longer
  // surfaced in the typed `ConnectorApp` shape (no readers).
  return {
    id: row.id,
    catalogId: row.catalogId,
    appId: row.appId,
    appSlug: row.appSlug,
    appName: row.appName,
    pem: row.pem,
    pemSha256: row.pemSha256,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastRefreshErrorAt: row.lastRefreshErrorAt,
    lastRefreshErrorMessage: row.lastRefreshErrorMessage,
  };
}

export class ConnectorAppRepo {
  constructor(private readonly db: RuntimeDB) {}

  list(): ConnectorApp[] {
    const rows = this.db.select().from(connectorApps).orderBy(asc(connectorApps.createdAt)).all();
    return rows.map(rowToApp);
  }

  get(id: string): ConnectorApp | null {
    const row = this.db.select().from(connectorApps).where(eq(connectorApps.id, id)).get();
    return row ? rowToApp(row) : null;
  }

  /** Look up by catalog_id + app_id (unique pair). */
  getByCatalogAndAppId(catalogId: string, appId: string): ConnectorApp | null {
    const row = this.db
      .select()
      .from(connectorApps)
      .where(and(eq(connectorApps.catalogId, catalogId), eq(connectorApps.appId, appId)))
      .get();
    return row ? rowToApp(row) : null;
  }

  /** Convenience for v1 (single App). Returns the first row for a catalog_id, or null. */
  getOneByCatalog(catalogId: string): ConnectorApp | null {
    const row = this.db
      .select()
      .from(connectorApps)
      .where(eq(connectorApps.catalogId, catalogId))
      .orderBy(asc(connectorApps.createdAt))
      .limit(1)
      .get();
    return row ? rowToApp(row) : null;
  }

  create(input: CreateConnectorAppInput): ConnectorApp {
    const id = input.id ?? randomUUID();
    this.db
      .insert(connectorApps)
      .values({
        id,
        catalogId: input.catalogId,
        appId: input.appId,
        appSlug: input.appSlug,
        appName: input.appName,
        pem: input.pem,
        pemSha256: input.pemSha256,
      })
      .run();
    const created = this.get(id);
    if (!created) throw new Error(`failed to read back connector_app ${id}`);
    return created;
  }

  update(id: string, patch: UpdateConnectorAppInput): ConnectorApp {
    const set: Record<string, unknown> = {};
    if (patch.appSlug !== undefined) set.appSlug = patch.appSlug;
    if (patch.appName !== undefined) set.appName = patch.appName;
    if (patch.pem !== undefined) set.pem = patch.pem;
    if (patch.pemSha256 !== undefined) set.pemSha256 = patch.pemSha256;
    // Spec 0051: pem_rotated_at branch removed (no remaining writers).
    if (patch.lastRefreshErrorAt !== undefined) set.lastRefreshErrorAt = patch.lastRefreshErrorAt;
    if (patch.lastRefreshErrorMessage !== undefined)
      set.lastRefreshErrorMessage = patch.lastRefreshErrorMessage;

    if (Object.keys(set).length === 0) {
      const current = this.get(id);
      if (!current) throw new Error(`connector_app ${id} not found`);
      return current;
    }

    set.updatedAt = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

    this.db.update(connectorApps).set(set).where(eq(connectorApps.id, id)).run();
    const updated = this.get(id);
    if (!updated) throw new Error(`connector_app ${id} not found after update`);
    return updated;
  }

  delete(id: string): boolean {
    const result = this.db.delete(connectorApps).where(eq(connectorApps.id, id)).run();
    return result.changes > 0;
  }
}
