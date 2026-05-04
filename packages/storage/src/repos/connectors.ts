import { randomUUID } from 'node:crypto';
import { decrypt, encrypt } from '../crypto.js';
import type { DB } from '../db.js';
import type {
  Connector,
  ConnectorInvocation,
  ConnectorKind,
  ConnectorSecret,
  ConnectorSource,
  ConnectorStatus,
  ConnectorToolPermission,
  ConnectorTransport,
  ConnectorWithRelations,
  CreateConnectorInput,
  InvocationResult,
  RecordInvocationInput,
  ToolCategory,
  ToolPermission,
  UpdateConnectorInput,
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
  /** Spec 0057: discriminator added by migration 18. Values: 'mcp' | 'channel'. */
  kind: string;
}

interface SecretRow {
  connector_id: string;
  key: string;
  /** Spec 0071: nullable after migration 21. Plaintext leftover for unmigrated rows; null otherwise. */
  value: string | null;
  /** Spec 0071: AES-256-GCM ciphertext + 16-byte auth tag. Null only for unmigrated rows. */
  value_encrypted: Buffer | null;
  /** Spec 0071: 12-byte IV. Null only for unmigrated rows. */
  iv: Buffer | null;
  is_public: number | null;
}

interface ToolRow {
  connector_id: string;
  tool_name: string;
  description: string | null;
  category: string;
  permission: string;
}

interface InvocationRow {
  id: number;
  connector_id: string;
  tool_name: string;
  thread_id: string | null;
  correlation_id: string | null;
  result: string;
  duration_ms: number;
  error_message: string | null;
  created_at: string;
}

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*$/;

function assertSlug(slug: string): void {
  if (!SLUG_REGEX.test(slug)) {
    throw new Error(`invalid slug ${JSON.stringify(slug)} — must match /^[a-z0-9][a-z0-9-]*$/`);
  }
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
    kind: row.kind as ConnectorKind,
  };
}

function rowToSecret(
  row: SecretRow,
  cryptoOpts?: { masterKey: Buffer; profileId: string },
): ConnectorSecret {
  let value: string;
  if (row.value_encrypted !== null && row.iv !== null) {
    if (!cryptoOpts) {
      throw new Error('ConnectorRepo: encrypted secret found but no cryptoOpts configured');
    }
    value = decrypt(cryptoOpts.masterKey, cryptoOpts.profileId, row.iv, row.value_encrypted);
  } else if (row.value !== null) {
    // Pre-0071 unmigrated row. Should be rare — boot helper migrates on
    // every startup. Tolerated as a transitional fallback.
    value = row.value;
  } else {
    throw new Error(
      `connector_secrets row (${row.connector_id}, ${row.key}) has neither value nor value_encrypted`,
    );
  }
  return {
    connectorId: row.connector_id,
    key: row.key,
    value,
    isPublic: row.is_public === 1,
  };
}

function rowToTool(row: ToolRow): ConnectorToolPermission {
  return {
    connectorId: row.connector_id,
    toolName: row.tool_name,
    description: row.description,
    category: row.category as ToolCategory,
    permission: row.permission as ToolPermission,
  };
}

function rowToInvocation(row: InvocationRow): ConnectorInvocation {
  return {
    id: row.id,
    connectorId: row.connector_id,
    toolName: row.tool_name,
    threadId: row.thread_id,
    correlationId: row.correlation_id,
    result: row.result as InvocationResult,
    durationMs: row.duration_ms,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  };
}

export interface ListConnectorsFilter {
  status?: ConnectorStatus;
  source?: ConnectorSource;
  /** Spec 0057: optionally filter by 'mcp' | 'channel'. Default behavior (no filter) returns all rows of any kind — preserves backward compat for callers that expect everything. */
  kind?: ConnectorKind;
}

export interface ConnectorRepoCryptoOpts {
  masterKey: Buffer;
  profileId: string;
}

export class ConnectorRepo {
  /**
   * Spec 0071: cryptoOpts is required to read/write `connector_secrets`.
   * Older callers may pass undefined IF and ONLY IF they never touch the
   * secrets methods (e.g. a read-only path that only inspects connectors).
   * The methods that need it throw with a clear error otherwise.
   */
  constructor(
    private readonly db: DB,
    private readonly cryptoOpts?: ConnectorRepoCryptoOpts,
  ) {}

  private requireCrypto(): ConnectorRepoCryptoOpts {
    if (!this.cryptoOpts) {
      throw new Error(
        'ConnectorRepo: cryptoOpts not provided — pass { masterKey, profileId } at construction to read/write secrets',
      );
    }
    return this.cryptoOpts;
  }

  list(filter: ListConnectorsFilter = {}): Connector[] {
    const where: string[] = [];
    const values: Array<string | number> = [];
    if (filter.status) {
      where.push('status = ?');
      values.push(filter.status);
    }
    if (filter.source) {
      where.push('source = ?');
      values.push(filter.source);
    }
    if (filter.kind) {
      where.push('kind = ?');
      values.push(filter.kind);
    }
    const sql = `SELECT * FROM connectors${
      where.length > 0 ? ` WHERE ${where.join(' AND ')}` : ''
    } ORDER BY created_at ASC`;
    const rows = this.db.prepare(sql).all(...values) as ConnectorRow[];
    return rows.map(rowToConnector);
  }

  /**
   * Spec 0057: list connectors filtered by kind. Thin wrapper around `list({ kind })`
   * for ergonomics — channel adapters and the MCP loader call this to query their
   * specific subset of the connectors table.
   */
  listByKind(kind: ConnectorKind): Connector[] {
    return this.list({ kind });
  }

  get(id: string): Connector | null {
    const row = this.db.prepare('SELECT * FROM connectors WHERE id = ?').get(id) as
      | ConnectorRow
      | undefined;
    return row ? rowToConnector(row) : null;
  }

  getBySlug(slug: string): Connector | null {
    const row = this.db.prepare('SELECT * FROM connectors WHERE slug = ?').get(slug) as
      | ConnectorRow
      | undefined;
    return row ? rowToConnector(row) : null;
  }

  getSecrets(connectorId: string): ConnectorSecret[] {
    const opts = this.requireCrypto();
    const rows = this.db
      .prepare('SELECT * FROM connector_secrets WHERE connector_id = ? ORDER BY key ASC')
      .all(connectorId) as SecretRow[];
    return rows.map((r) => rowToSecret(r, opts));
  }

  getTools(connectorId: string): ConnectorToolPermission[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM connector_tool_permissions WHERE connector_id = ? ORDER BY tool_name ASC',
      )
      .all(connectorId) as ToolRow[];
    return rows.map(rowToTool);
  }

  /**
   * Load every `enabled` connector with its secrets and tools attached. Used by
   * the MCP loader (spec 0032) to build the SDK config map per turn.
   */
  getEnabledWithRelations(): ConnectorWithRelations[] {
    const connectors = this.list({ status: 'enabled' });
    return connectors.map((c) => ({
      connector: c,
      secrets: this.getSecrets(c.id),
      tools: this.getTools(c.id),
    }));
  }

  create(input: CreateConnectorInput): Connector {
    assertSlug(input.slug);
    const id = input.id ?? randomUUID();
    const status = input.status ?? 'enabled';
    const insert = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO connectors (
             id, slug, display_name, description, source, catalog_id,
             transport, command, args, url, status, app_id, kind
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          input.slug,
          input.displayName,
          input.description ?? null,
          input.source,
          input.catalogId ?? null,
          input.transport,
          input.command ?? null,
          input.args ? JSON.stringify(input.args) : null,
          input.url ?? null,
          status,
          input.appId ?? null,
          input.kind ?? 'mcp',
        );

      const opts = this.requireCrypto();
      const insertSecret = this.db.prepare(
        'INSERT INTO connector_secrets (connector_id, key, value, value_encrypted, iv, is_public) VALUES (?, ?, NULL, ?, ?, ?)',
      );
      for (const secret of input.secrets) {
        const { iv, ciphertext } = encrypt(opts.masterKey, opts.profileId, secret.value);
        insertSecret.run(id, secret.key, ciphertext, iv, secret.isPublic ? 1 : 0);
      }

      const insertTool = this.db.prepare(
        `INSERT INTO connector_tool_permissions (connector_id, tool_name, description, category, permission)
         VALUES (?, ?, ?, ?, ?)`,
      );
      for (const tool of input.tools) {
        insertTool.run(id, tool.toolName, tool.description, tool.category, tool.permission);
      }
    });
    insert();
    const created = this.get(id);
    if (!created) throw new Error(`failed to read back connector ${id} after insert`);
    return created;
  }

  update(id: string, patch: UpdateConnectorInput): Connector {
    const fields: string[] = [];
    const values: Array<string | number | null> = [];

    if (patch.displayName !== undefined) {
      fields.push('display_name = ?');
      values.push(patch.displayName);
    }
    if (patch.description !== undefined) {
      fields.push('description = ?');
      values.push(patch.description);
    }
    if (patch.command !== undefined) {
      fields.push('command = ?');
      values.push(patch.command);
    }
    if (patch.args !== undefined) {
      fields.push('args = ?');
      values.push(patch.args ? JSON.stringify(patch.args) : null);
    }
    if (patch.url !== undefined) {
      fields.push('url = ?');
      values.push(patch.url);
    }
    if (patch.status !== undefined) {
      fields.push('status = ?');
      values.push(patch.status);
    }
    if (patch.lastError !== undefined) {
      fields.push('last_error = ?');
      values.push(patch.lastError);
    }
    if (patch.lastErrorAt !== undefined) {
      fields.push('last_error_at = ?');
      values.push(patch.lastErrorAt);
    }
    if (patch.lastVerifiedAt !== undefined) {
      fields.push('last_verified_at = ?');
      values.push(patch.lastVerifiedAt);
    }

    if (fields.length === 0) {
      const current = this.get(id);
      if (!current) throw new Error(`connector ${id} not found`);
      return current;
    }

    fields.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')");
    values.push(id);

    this.db.prepare(`UPDATE connectors SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    const updated = this.get(id);
    if (!updated) throw new Error(`connector ${id} not found after update`);
    return updated;
  }

  replaceSecrets(
    connectorId: string,
    secrets: Array<{ key: string; value: string; isPublic?: boolean }>,
  ): void {
    const opts = this.requireCrypto();
    const replace = this.db.transaction(() => {
      this.db.prepare('DELETE FROM connector_secrets WHERE connector_id = ?').run(connectorId);
      const insert = this.db.prepare(
        'INSERT INTO connector_secrets (connector_id, key, value, value_encrypted, iv, is_public) VALUES (?, ?, NULL, ?, ?, ?)',
      );
      for (const secret of secrets) {
        const { iv, ciphertext } = encrypt(opts.masterKey, opts.profileId, secret.value);
        insert.run(connectorId, secret.key, ciphertext, iv, secret.isPublic ? 1 : 0);
      }
    });
    replace();
  }

  replaceTools(
    connectorId: string,
    tools: Array<Omit<ConnectorToolPermission, 'connectorId'>>,
  ): void {
    const replace = this.db.transaction(() => {
      this.db
        .prepare('DELETE FROM connector_tool_permissions WHERE connector_id = ?')
        .run(connectorId);
      const insert = this.db.prepare(
        `INSERT INTO connector_tool_permissions (connector_id, tool_name, description, category, permission)
         VALUES (?, ?, ?, ?, ?)`,
      );
      for (const tool of tools) {
        insert.run(connectorId, tool.toolName, tool.description, tool.category, tool.permission);
      }
    });
    replace();
  }

  setToolPermission(connectorId: string, toolName: string, permission: ToolPermission): boolean {
    const result = this.db
      .prepare(
        'UPDATE connector_tool_permissions SET permission = ? WHERE connector_id = ? AND tool_name = ?',
      )
      .run(permission, connectorId, toolName);
    return result.changes > 0;
  }

  setBulkPermission(
    connectorId: string,
    category: ToolCategory,
    permission: ToolPermission,
  ): number {
    const result = this.db
      .prepare(
        'UPDATE connector_tool_permissions SET permission = ? WHERE connector_id = ? AND category = ?',
      )
      .run(permission, connectorId, category);
    return result.changes;
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM connectors WHERE id = ?').run(id);
    return result.changes > 0;
  }

  recordInvocation(input: RecordInvocationInput): void {
    this.db
      .prepare(
        `INSERT INTO connector_invocations
           (connector_id, tool_name, thread_id, correlation_id, result, duration_ms, error_message)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.connectorId,
        input.toolName,
        input.threadId ?? null,
        input.correlationId ?? null,
        input.result,
        input.durationMs,
        input.errorMessage ?? null,
      );
  }

  recentInvocations(connectorId: string, limit = 20): ConnectorInvocation[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM connector_invocations WHERE connector_id = ? ORDER BY id DESC LIMIT ?',
      )
      .all(connectorId, limit) as InvocationRow[];
    return rows.map(rowToInvocation);
  }

  /**
   * Count invocations created since the given ISO timestamp. Used by the
   * dashboard list view (spec 0034) for the 24h activity counter.
   */
  countInvocationsSince(connectorId: string, sinceIsoTimestamp: string): number {
    const row = this.db
      .prepare(
        'SELECT COUNT(*) AS c FROM connector_invocations WHERE connector_id = ? AND created_at >= ?',
      )
      .get(connectorId, sinceIsoTimestamp) as { c: number };
    return row.c;
  }
}
