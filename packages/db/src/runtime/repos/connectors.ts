import { randomUUID } from 'node:crypto';
import { and, asc, count, desc, eq, gte, sql } from 'drizzle-orm';
import { decrypt, encrypt } from '../crypto.js';
import type { RuntimeDB } from '../db.js';
import {
  connectorInvocations,
  connectorSecrets,
  connectors,
  connectorToolPermissions,
} from '../schema.js';

// ───────────────────────────────────────────────────────────────────
// Domain types (preserved from @zeno/storage for byte-identical API)
// ───────────────────────────────────────────────────────────────────

export type ConnectorTransport = 'stdio' | 'remote';
export type ConnectorSource = 'catalog' | 'custom';
export type ConnectorStatus = 'enabled' | 'disabled' | 'pending';
export type ToolCategory = 'read' | 'write' | 'interactive';
export type ToolPermission = 'always_allow' | 'ask' | 'never';
export type InvocationResult = 'ok' | 'error';
/**
 * Spec 0057: discriminator for the connectors table. 'mcp' = a connector that
 * exposes MCP tools the agent calls. 'channel' = a transport that delivers
 * messages to the agent (e.g. Slack). Channels share storage with MCP
 * connectors but have NO MCP server spawn (transport='remote' is a
 * placeholder; the MCP loader guards on kind='mcp' to skip them).
 */
export type ConnectorKind = 'mcp' | 'channel';

export interface Connector {
  id: string;
  slug: string;
  displayName: string;
  description: string | null;
  source: ConnectorSource;
  catalogId: string | null;
  transport: ConnectorTransport;
  command: string | null;
  args: string[] | null;
  url: string | null;
  status: ConnectorStatus;
  lastError: string | null;
  lastErrorAt: string | null;
  lastVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Spec 0044: FK to connector_apps.id for github-app-* rows. Null otherwise. */
  appId: string | null;
  /** Spec 0057: discriminator. */
  kind: ConnectorKind;
}

export interface ConnectorSecret {
  connectorId: string;
  key: string;
  value: string;
  /**
   * Spec 0044: when true, the dashboard renders this secret unmasked (e.g.
   * GitHub App ID). Storage layer treats it identically to other secrets;
   * the masking decision is UI-only.
   */
  isPublic?: boolean;
}

export interface ConnectorToolPermission {
  connectorId: string;
  toolName: string;
  description: string | null;
  category: ToolCategory;
  permission: ToolPermission;
}

export interface ConnectorInvocation {
  id: number;
  connectorId: string;
  toolName: string;
  threadId: string | null;
  correlationId: string | null;
  result: InvocationResult;
  durationMs: number;
  errorMessage: string | null;
  createdAt: string;
}

export interface CreateConnectorInput {
  id?: string;
  slug: string;
  displayName: string;
  description?: string | null;
  source: ConnectorSource;
  catalogId?: string | null;
  transport: ConnectorTransport;
  command?: string | null;
  args?: string[] | null;
  url?: string | null;
  status?: ConnectorStatus;
  secrets: Array<{ key: string; value: string; isPublic?: boolean }>;
  tools: Array<Omit<ConnectorToolPermission, 'connectorId'>>;
  /** Spec 0044: optional FK to connector_apps.id (github-app-* rows). */
  appId?: string | null;
  /** Spec 0057: optional discriminator. Defaults to 'mcp' for backward compat. */
  kind?: ConnectorKind;
}

export interface UpdateConnectorInput {
  displayName?: string;
  description?: string | null;
  command?: string | null;
  args?: string[] | null;
  url?: string | null;
  status?: ConnectorStatus;
  lastError?: string | null;
  lastErrorAt?: string | null;
  lastVerifiedAt?: string | null;
}

export interface ConnectorWithRelations {
  connector: Connector;
  secrets: ConnectorSecret[];
  tools: ConnectorToolPermission[];
}

export interface RecordInvocationInput {
  connectorId: string;
  toolName: string;
  threadId?: string | null;
  correlationId?: string | null;
  result: InvocationResult;
  durationMs: number;
  errorMessage?: string | null;
}

export interface ListConnectorsFilter {
  status?: ConnectorStatus;
  source?: ConnectorSource;
  /** Spec 0057: optionally filter by 'mcp' | 'channel'. */
  kind?: ConnectorKind;
}

export interface ConnectorRepoCryptoOpts {
  masterKey: Buffer;
  profileId: string;
}

// ───────────────────────────────────────────────────────────────────
// Row → domain mappers
// ───────────────────────────────────────────────────────────────────

type ConnectorRow = typeof connectors.$inferSelect;
type SecretRow = typeof connectorSecrets.$inferSelect;
type ToolRow = typeof connectorToolPermissions.$inferSelect;
type InvocationRow = typeof connectorInvocations.$inferSelect;

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
    displayName: row.displayName,
    description: row.description,
    source: row.source,
    catalogId: row.catalogId,
    transport: row.transport,
    command: row.command,
    args: row.args ? (JSON.parse(row.args) as string[]) : null,
    url: row.url,
    status: row.status,
    lastError: row.lastError,
    lastErrorAt: row.lastErrorAt,
    lastVerifiedAt: row.lastVerifiedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    appId: row.appId,
    kind: row.kind,
  };
}

function rowToSecret(
  row: SecretRow,
  cryptoOpts: { masterKey: Buffer; profileId: string },
): ConnectorSecret {
  // Spec 0071 (post-unify): table no longer has a plaintext `value` column.
  // Every row holds `value_encrypted` + `iv`, both NOT NULL.
  const value = decrypt(cryptoOpts.masterKey, cryptoOpts.profileId, row.iv, row.valueEncrypted);
  return {
    connectorId: row.connectorId,
    key: row.key,
    value,
    isPublic: row.isPublic === 1,
  };
}

function rowToTool(row: ToolRow): ConnectorToolPermission {
  return {
    connectorId: row.connectorId,
    toolName: row.toolName,
    description: row.description,
    category: row.category,
    permission: row.permission,
  };
}

function rowToInvocation(row: InvocationRow): ConnectorInvocation {
  return {
    id: row.id,
    connectorId: row.connectorId,
    toolName: row.toolName,
    threadId: row.threadId,
    correlationId: row.correlationId,
    result: row.result,
    durationMs: row.durationMs,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
  };
}

export class ConnectorRepo {
  /**
   * Spec 0071: cryptoOpts is required to read/write `connector_secrets`.
   * Older callers may pass undefined IF and ONLY IF they never touch the
   * secrets methods (e.g. a read-only path that only inspects connectors).
   * The methods that need it throw with a clear error otherwise.
   */
  constructor(
    private readonly db: RuntimeDB,
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
    const conditions = [];
    if (filter.status) conditions.push(eq(connectors.status, filter.status));
    if (filter.source) conditions.push(eq(connectors.source, filter.source));
    if (filter.kind) conditions.push(eq(connectors.kind, filter.kind));

    const query = this.db.select().from(connectors);
    const rows =
      conditions.length > 0
        ? query
            .where(conditions.length === 1 ? conditions[0] : and(...conditions))
            .orderBy(asc(connectors.createdAt))
            .all()
        : query.orderBy(asc(connectors.createdAt)).all();
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
    const row = this.db.select().from(connectors).where(eq(connectors.id, id)).get();
    return row ? rowToConnector(row) : null;
  }

  getBySlug(slug: string): Connector | null {
    const row = this.db.select().from(connectors).where(eq(connectors.slug, slug)).get();
    return row ? rowToConnector(row) : null;
  }

  getSecrets(connectorId: string): ConnectorSecret[] {
    const opts = this.requireCrypto();
    const rows = this.db
      .select()
      .from(connectorSecrets)
      .where(eq(connectorSecrets.connectorId, connectorId))
      .orderBy(asc(connectorSecrets.key))
      .all();
    return rows.map((r) => rowToSecret(r, opts));
  }

  getTools(connectorId: string): ConnectorToolPermission[] {
    const rows = this.db
      .select()
      .from(connectorToolPermissions)
      .where(eq(connectorToolPermissions.connectorId, connectorId))
      .orderBy(asc(connectorToolPermissions.toolName))
      .all();
    return rows.map(rowToTool);
  }

  /**
   * Load every `enabled` connector with its secrets and tools attached. Used by
   * the MCP loader (spec 0032) to build the SDK config map per turn.
   */
  getEnabledWithRelations(): ConnectorWithRelations[] {
    const list = this.list({ status: 'enabled' });
    return list.map((c) => ({
      connector: c,
      secrets: this.getSecrets(c.id),
      tools: this.getTools(c.id),
    }));
  }

  create(input: CreateConnectorInput): Connector {
    assertSlug(input.slug);
    const id = input.id ?? randomUUID();
    const status = input.status ?? 'enabled';
    const opts = this.requireCrypto();

    this.db.transaction((tx) => {
      tx.insert(connectors)
        .values({
          id,
          slug: input.slug,
          displayName: input.displayName,
          description: input.description ?? null,
          source: input.source,
          catalogId: input.catalogId ?? null,
          transport: input.transport,
          command: input.command ?? null,
          args: input.args ? JSON.stringify(input.args) : null,
          url: input.url ?? null,
          status,
          appId: input.appId ?? null,
          kind: input.kind ?? 'mcp',
        })
        .run();

      for (const secret of input.secrets) {
        const { iv, ciphertext } = encrypt(opts.masterKey, opts.profileId, secret.value);
        tx.insert(connectorSecrets)
          .values({
            connectorId: id,
            key: secret.key,
            valueEncrypted: ciphertext,
            iv,
            isPublic: secret.isPublic ? 1 : 0,
          })
          .run();
      }

      for (const tool of input.tools) {
        tx.insert(connectorToolPermissions)
          .values({
            connectorId: id,
            toolName: tool.toolName,
            description: tool.description,
            category: tool.category,
            permission: tool.permission,
          })
          .run();
      }
    });

    const created = this.get(id);
    if (!created) throw new Error(`failed to read back connector ${id} after insert`);
    return created;
  }

  update(id: string, patch: UpdateConnectorInput): Connector {
    const set: Record<string, unknown> = {};

    if (patch.displayName !== undefined) set.displayName = patch.displayName;
    if (patch.description !== undefined) set.description = patch.description;
    if (patch.command !== undefined) set.command = patch.command;
    if (patch.args !== undefined) set.args = patch.args ? JSON.stringify(patch.args) : null;
    if (patch.url !== undefined) set.url = patch.url;
    if (patch.status !== undefined) set.status = patch.status;
    if (patch.lastError !== undefined) set.lastError = patch.lastError;
    if (patch.lastErrorAt !== undefined) set.lastErrorAt = patch.lastErrorAt;
    if (patch.lastVerifiedAt !== undefined) set.lastVerifiedAt = patch.lastVerifiedAt;

    if (Object.keys(set).length === 0) {
      const current = this.get(id);
      if (!current) throw new Error(`connector ${id} not found`);
      return current;
    }

    set.updatedAt = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

    this.db.update(connectors).set(set).where(eq(connectors.id, id)).run();
    const updated = this.get(id);
    if (!updated) throw new Error(`connector ${id} not found after update`);
    return updated;
  }

  replaceSecrets(
    connectorId: string,
    secrets: Array<{ key: string; value: string; isPublic?: boolean }>,
  ): void {
    const opts = this.requireCrypto();
    this.db.transaction((tx) => {
      tx.delete(connectorSecrets).where(eq(connectorSecrets.connectorId, connectorId)).run();
      for (const secret of secrets) {
        const { iv, ciphertext } = encrypt(opts.masterKey, opts.profileId, secret.value);
        tx.insert(connectorSecrets)
          .values({
            connectorId,
            key: secret.key,
            valueEncrypted: ciphertext,
            iv,
            isPublic: secret.isPublic ? 1 : 0,
          })
          .run();
      }
    });
  }

  replaceTools(
    connectorId: string,
    tools: Array<Omit<ConnectorToolPermission, 'connectorId'>>,
  ): void {
    this.db.transaction((tx) => {
      tx.delete(connectorToolPermissions)
        .where(eq(connectorToolPermissions.connectorId, connectorId))
        .run();
      for (const tool of tools) {
        tx.insert(connectorToolPermissions)
          .values({
            connectorId,
            toolName: tool.toolName,
            description: tool.description,
            category: tool.category,
            permission: tool.permission,
          })
          .run();
      }
    });
  }

  setToolPermission(connectorId: string, toolName: string, permission: ToolPermission): boolean {
    const result = this.db
      .update(connectorToolPermissions)
      .set({ permission })
      .where(
        and(
          eq(connectorToolPermissions.connectorId, connectorId),
          eq(connectorToolPermissions.toolName, toolName),
        ),
      )
      .run();
    return result.changes > 0;
  }

  setBulkPermission(
    connectorId: string,
    category: ToolCategory,
    permission: ToolPermission,
  ): number {
    const result = this.db
      .update(connectorToolPermissions)
      .set({ permission })
      .where(
        and(
          eq(connectorToolPermissions.connectorId, connectorId),
          eq(connectorToolPermissions.category, category),
        ),
      )
      .run();
    return result.changes;
  }

  delete(id: string): boolean {
    const result = this.db.delete(connectors).where(eq(connectors.id, id)).run();
    return result.changes > 0;
  }

  recordInvocation(input: RecordInvocationInput): void {
    this.db
      .insert(connectorInvocations)
      .values({
        connectorId: input.connectorId,
        toolName: input.toolName,
        threadId: input.threadId ?? null,
        correlationId: input.correlationId ?? null,
        result: input.result,
        durationMs: input.durationMs,
        errorMessage: input.errorMessage ?? null,
      })
      .run();
  }

  recentInvocations(connectorId: string, limit = 20): ConnectorInvocation[] {
    const rows = this.db
      .select()
      .from(connectorInvocations)
      .where(eq(connectorInvocations.connectorId, connectorId))
      .orderBy(desc(connectorInvocations.id))
      .limit(limit)
      .all();
    return rows.map(rowToInvocation);
  }

  /**
   * Count invocations created since the given ISO timestamp. Used by the
   * dashboard list view (spec 0034) for the 24h activity counter.
   */
  countInvocationsSince(connectorId: string, sinceIsoTimestamp: string): number {
    const row = this.db
      .select({ c: count() })
      .from(connectorInvocations)
      .where(
        and(
          eq(connectorInvocations.connectorId, connectorId),
          gte(connectorInvocations.createdAt, sinceIsoTimestamp),
        ),
      )
      .get();
    return row?.c ?? 0;
  }
}
