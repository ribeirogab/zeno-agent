import { and, asc, eq, sql } from 'drizzle-orm';
import type { RuntimeDB } from '../db.js';
import { connectors, cronConnectors } from '../schema.js';
import type {
  Connector,
  ConnectorKind,
  ConnectorSource,
  ConnectorStatus,
  ConnectorTransport,
} from './connectors.js';

export interface CronConnectorLink {
  cronId: string;
  connectorId: string;
  createdAt: string;
}

type ConnectorRow = typeof connectors.$inferSelect;
type LinkRow = typeof cronConnectors.$inferSelect;

function rowToConnector(row: ConnectorRow): Connector {
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.displayName,
    instanceLabel: row.instanceLabel,
    description: row.description,
    source: row.source as ConnectorSource,
    catalogId: row.catalogId,
    transport: row.transport as ConnectorTransport,
    command: row.command,
    args: row.args ? (JSON.parse(row.args) as string[]) : null,
    url: row.url,
    status: row.status as ConnectorStatus,
    lastError: row.lastError,
    lastErrorAt: row.lastErrorAt,
    lastVerifiedAt: row.lastVerifiedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    appId: row.appId,
    kind: row.kind as ConnectorKind,
  };
}

function rowToLink(row: LinkRow): CronConnectorLink {
  return {
    cronId: row.cronId,
    connectorId: row.connectorId,
    createdAt: row.createdAt,
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
  constructor(private readonly db: RuntimeDB) {}

  listForCron(cronId: string): Connector[] {
    const rows = this.db
      .select({
        id: connectors.id,
        slug: connectors.slug,
        displayName: connectors.displayName,
        instanceLabel: connectors.instanceLabel,
        description: connectors.description,
        source: connectors.source,
        catalogId: connectors.catalogId,
        transport: connectors.transport,
        command: connectors.command,
        args: connectors.args,
        url: connectors.url,
        status: connectors.status,
        lastError: connectors.lastError,
        lastErrorAt: connectors.lastErrorAt,
        lastVerifiedAt: connectors.lastVerifiedAt,
        createdAt: connectors.createdAt,
        updatedAt: connectors.updatedAt,
        appId: connectors.appId,
        kind: connectors.kind,
      })
      .from(connectors)
      .innerJoin(cronConnectors, eq(cronConnectors.connectorId, connectors.id))
      .where(eq(cronConnectors.cronId, cronId))
      .orderBy(asc(connectors.slug))
      .all();
    return rows.map(rowToConnector);
  }

  listForConnector(connectorId: string): CronConnectorLink[] {
    const rows = this.db
      .select()
      .from(cronConnectors)
      .where(eq(cronConnectors.connectorId, connectorId))
      .orderBy(asc(cronConnectors.cronId))
      .all();
    return rows.map(rowToLink);
  }

  /**
   * Atomic replace of the cron's connector link list. Connector ids that
   * don't exist in `connectors` are silently skipped. Single transaction.
   */
  replaceForCron(cronId: string, connectorIds: string[]): void {
    this.db.transaction((tx) => {
      tx.delete(cronConnectors).where(eq(cronConnectors.cronId, cronId)).run();
      for (const connectorId of connectorIds) {
        tx.run(sql`
          INSERT INTO ${cronConnectors} (cron_id, connector_id)
          SELECT ${cronId}, ${connectorId}
          WHERE EXISTS (SELECT 1 FROM ${connectors} WHERE id = ${connectorId})
        `);
      }
    });
  }

  add(cronId: string, connectorId: string): void {
    this.db
      .insert(cronConnectors)
      .values({ cronId, connectorId })
      .onConflictDoNothing({ target: [cronConnectors.cronId, cronConnectors.connectorId] })
      .run();
  }

  remove(cronId: string, connectorId: string): boolean {
    const result = this.db
      .delete(cronConnectors)
      .where(and(eq(cronConnectors.cronId, cronId), eq(cronConnectors.connectorId, connectorId)))
      .run();
    return result.changes > 0;
  }
}
