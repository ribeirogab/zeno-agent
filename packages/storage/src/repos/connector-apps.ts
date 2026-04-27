/**
 * `connector_apps` repository — one row per (catalog_id, app_id).
 * Spec 0044.
 */

import { randomUUID } from 'node:crypto';
import type { DB } from '../db.js';
import type { ConnectorApp, CreateConnectorAppInput, UpdateConnectorAppInput } from '../types.js';

interface ConnectorAppRow {
  id: string;
  catalog_id: string;
  app_id: string;
  app_slug: string;
  app_name: string;
  pem: string;
  pem_sha256: string;
  pem_rotated_at: string | null;
  created_at: string;
  updated_at: string;
}

function rowToApp(row: ConnectorAppRow): ConnectorApp {
  return {
    id: row.id,
    catalogId: row.catalog_id,
    appId: row.app_id,
    appSlug: row.app_slug,
    appName: row.app_name,
    pem: row.pem,
    pemSha256: row.pem_sha256,
    pemRotatedAt: row.pem_rotated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ConnectorAppRepo {
  constructor(private readonly db: DB) {}

  list(): ConnectorApp[] {
    const rows = this.db
      .prepare('SELECT * FROM connector_apps ORDER BY created_at ASC')
      .all() as ConnectorAppRow[];
    return rows.map(rowToApp);
  }

  get(id: string): ConnectorApp | null {
    const row = this.db.prepare('SELECT * FROM connector_apps WHERE id = ?').get(id) as
      | ConnectorAppRow
      | undefined;
    return row ? rowToApp(row) : null;
  }

  /** Look up by catalog_id + app_id (unique pair). */
  getByCatalogAndAppId(catalogId: string, appId: string): ConnectorApp | null {
    const row = this.db
      .prepare('SELECT * FROM connector_apps WHERE catalog_id = ? AND app_id = ?')
      .get(catalogId, appId) as ConnectorAppRow | undefined;
    return row ? rowToApp(row) : null;
  }

  /** Convenience for v1 (single App). Returns the first row for a catalog_id, or null. */
  getOneByCatalog(catalogId: string): ConnectorApp | null {
    const row = this.db
      .prepare('SELECT * FROM connector_apps WHERE catalog_id = ? ORDER BY created_at ASC LIMIT 1')
      .get(catalogId) as ConnectorAppRow | undefined;
    return row ? rowToApp(row) : null;
  }

  create(input: CreateConnectorAppInput): ConnectorApp {
    const id = input.id ?? randomUUID();
    this.db
      .prepare(
        `INSERT INTO connector_apps (id, catalog_id, app_id, app_slug, app_name, pem, pem_sha256)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.catalogId,
        input.appId,
        input.appSlug,
        input.appName,
        input.pem,
        input.pemSha256,
      );
    const created = this.get(id);
    if (!created) throw new Error(`failed to read back connector_app ${id}`);
    return created;
  }

  update(id: string, patch: UpdateConnectorAppInput): ConnectorApp {
    const fields: string[] = [];
    const values: Array<string | number | null> = [];
    if (patch.appSlug !== undefined) {
      fields.push('app_slug = ?');
      values.push(patch.appSlug);
    }
    if (patch.appName !== undefined) {
      fields.push('app_name = ?');
      values.push(patch.appName);
    }
    if (patch.pem !== undefined) {
      fields.push('pem = ?');
      values.push(patch.pem);
    }
    if (patch.pemSha256 !== undefined) {
      fields.push('pem_sha256 = ?');
      values.push(patch.pemSha256);
    }
    if (patch.pemRotatedAt !== undefined) {
      fields.push('pem_rotated_at = ?');
      values.push(patch.pemRotatedAt);
    }
    if (fields.length === 0) {
      const current = this.get(id);
      if (!current) throw new Error(`connector_app ${id} not found`);
      return current;
    }
    fields.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')");
    values.push(id);
    this.db.prepare(`UPDATE connector_apps SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    const updated = this.get(id);
    if (!updated) throw new Error(`connector_app ${id} not found after update`);
    return updated;
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM connector_apps WHERE id = ?').run(id);
    return result.changes > 0;
  }
}
