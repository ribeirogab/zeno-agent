import type { DB } from '../db.js';
import type {
  Connector,
  ConnectorSource,
  ConnectorStatus,
  ConnectorTransport,
  CronConnectorLink,
} from '../types.js';

interface ConnectorRow {
  id: string;
  slug: string;
  display_name: string;
  description: string | null;
  source: string;
  catalog_id: string | null;
  transport: string;
  command: string | null;
  args: string | null;
  url: string | null;
  status: string;
  last_error: string | null;
  last_error_at: string | null;
  last_verified_at: string | null;
  created_at: string;
  updated_at: string;
  app_id: string | null;
}

interface LinkRow {
  cron_id: string;
  connector_id: string;
  created_at: string;
}

function rowToConnector(row: ConnectorRow): Connector {
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.display_name,
    description: row.description,
    source: row.source as ConnectorSource,
    catalogId: row.catalog_id,
    transport: row.transport as ConnectorTransport,
    command: row.command,
    args: row.args ? (JSON.parse(row.args) as string[]) : null,
    url: row.url,
    status: row.status as ConnectorStatus,
    lastError: row.last_error,
    lastErrorAt: row.last_error_at,
    lastVerifiedAt: row.last_verified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    appId: row.app_id,
  };
}

function rowToLink(row: LinkRow): CronConnectorLink {
  return {
    cronId: row.cron_id,
    connectorId: row.connector_id,
    createdAt: row.created_at,
  };
}

/**
 * Spec 0054: M:N relationship between crons and connectors. Hint-mode link:
 * the linked slug list is surfaced in the [zeno_context] block as preferred,
 * but the connector-permission gate (spec 0050) stays the single allow/deny
 * authority. Use of an unlinked connector emits an audit log; it is NOT
 * blocked by this link.
 */
export class CronConnectorRepo {
  constructor(private readonly db: DB) {}

  listForCron(cronId: string): Connector[] {
    const rows = this.db
      .prepare(
        `SELECT c.* FROM connectors c
         INNER JOIN cron_connectors cc ON cc.connector_id = c.id
         WHERE cc.cron_id = ?
         ORDER BY c.slug ASC`,
      )
      .all(cronId) as ConnectorRow[];
    return rows.map(rowToConnector);
  }

  listForConnector(connectorId: string): CronConnectorLink[] {
    const rows = this.db
      .prepare(`SELECT * FROM cron_connectors WHERE connector_id = ? ORDER BY cron_id ASC`)
      .all(connectorId) as LinkRow[];
    return rows.map(rowToLink);
  }

  /**
   * Atomic replace of the cron's connector link list. Connector ids that
   * don't exist in `connectors` are silently skipped. Single transaction.
   */
  replaceForCron(cronId: string, connectorIds: string[]): void {
    const txn = this.db.transaction(() => {
      this.db.prepare('DELETE FROM cron_connectors WHERE cron_id = ?').run(cronId);
      const insert = this.db.prepare(
        `INSERT INTO cron_connectors (cron_id, connector_id)
         SELECT ?, ? WHERE EXISTS (SELECT 1 FROM connectors WHERE id = ?)`,
      );
      for (const connectorId of connectorIds) {
        insert.run(cronId, connectorId, connectorId);
      }
    });
    txn();
  }

  add(cronId: string, connectorId: string): void {
    this.db
      .prepare(`INSERT OR IGNORE INTO cron_connectors (cron_id, connector_id) VALUES (?, ?)`)
      .run(cronId, connectorId);
  }

  remove(cronId: string, connectorId: string): boolean {
    const result = this.db
      .prepare(`DELETE FROM cron_connectors WHERE cron_id = ? AND connector_id = ?`)
      .run(cronId, connectorId);
    return result.changes > 0;
  }
}
