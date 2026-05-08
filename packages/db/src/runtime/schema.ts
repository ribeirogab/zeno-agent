import { sql } from 'drizzle-orm';
import {
  blob,
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

const oldTimestamp = sql`CURRENT_TIMESTAMP`;
const isoTimestamp = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

export const sessions = sqliteTable('sessions', {
  threadId: text('thread_id').primaryKey(),
  sessionId: text('session_id').notNull(),
  createdAt: text('created_at').notNull().default(oldTimestamp),
  lastUsedAt: text('last_used_at').notNull().default(oldTimestamp),
});

export const crons = sqliteTable(
  'crons',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    prompt: text('prompt').notNull(),
    schedule: text('schedule').notNull(),
    enabled: integer('enabled').notNull().default(1),
    source: text('source').notNull(),
    createdBy: text('created_by'),
    notifyConversationId: text('notify_conversation_id'),
    notifyThreadId: text('notify_thread_id'),
    createdAt: text('created_at').notNull().default(oldTimestamp),
    updatedAt: text('updated_at').notNull().default(oldTimestamp),
    lastRunAt: text('last_run_at'),
    nextRunAt: text('next_run_at'),
  },
  (table) => ({
    idxEnabledNextRun: index('idx_crons_enabled_next_run').on(table.enabled, table.nextRunAt),
  }),
);

export const cronRuns = sqliteTable(
  'cron_runs',
  {
    id: text('id').primaryKey(),
    cronId: text('cron_id')
      .notNull()
      .references(() => crons.id, { onDelete: 'cascade' }),
    startedAt: text('started_at').notNull().default(oldTimestamp),
    finishedAt: text('finished_at'),
    status: text('status').notNull(),
    output: text('output'),
    error: text('error'),
  },
  (table) => ({
    idxCronStarted: index('idx_cron_runs_cron').on(table.cronId, sql`${table.startedAt} DESC`),
  }),
);

export const commands = sqliteTable(
  'commands',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    payload: text('payload'),
    status: text('status').notNull().default('pending'),
    createdAt: text('created_at').notNull().default(oldTimestamp),
    processedAt: text('processed_at'),
    completedAt: text('completed_at'),
    result: text('result'),
    correlationId: text('correlation_id').notNull(),
  },
  (table) => ({
    pendingIdx: index('commands_pending_idx')
      .on(table.status, table.createdAt)
      .where(sql`${table.status} = 'pending'`),
  }),
);

export const logs = sqliteTable(
  'logs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ts: text('ts').notNull(),
    level: integer('level').notNull(),
    service: text('service').notNull(),
    event: text('event'),
    correlationId: text('correlation_id'),
    message: text('message'),
    payload: text('payload').notNull(),
  },
  (table) => ({
    tsDescIdx: index('logs_ts_desc_idx').on(sql`${table.ts} DESC`),
    levelIdx: index('logs_level_idx').on(table.level),
    eventIdx: index('logs_event_idx').on(table.event),
    correlationIdx: index('logs_correlation_idx').on(table.correlationId),
  }),
);

export const connectorApps = sqliteTable(
  'connector_apps',
  {
    id: text('id').primaryKey(),
    catalogId: text('catalog_id').notNull(),
    appId: text('app_id').notNull(),
    appSlug: text('app_slug').notNull(),
    appName: text('app_name').notNull(),
    pem: text('pem').notNull(),
    pemSha256: text('pem_sha256').notNull(),
    pemRotatedAt: text('pem_rotated_at'),
    lastRefreshErrorAt: text('last_refresh_error_at'),
    lastRefreshErrorMessage: text('last_refresh_error_message'),
    createdAt: text('created_at').notNull().default(isoTimestamp),
    updatedAt: text('updated_at').notNull().default(isoTimestamp),
  },
  (table) => ({
    catalogAppUnique: uniqueIndex('connector_apps_catalog_app_unique').on(
      table.catalogId,
      table.appId,
    ),
    idxCatalog: index('idx_connector_apps_catalog').on(table.catalogId),
  }),
);

export const connectors = sqliteTable(
  'connectors',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    displayName: text('display_name').notNull(),
    description: text('description'),
    source: text('source', { enum: ['catalog', 'custom'] }).notNull(),
    catalogId: text('catalog_id'),
    transport: text('transport', { enum: ['stdio', 'remote'] }).notNull(),
    command: text('command'),
    args: text('args'),
    url: text('url'),
    status: text('status', { enum: ['enabled', 'disabled', 'pending'] })
      .notNull()
      .default('enabled'),
    lastError: text('last_error'),
    lastErrorAt: text('last_error_at'),
    lastVerifiedAt: text('last_verified_at'),
    appId: text('app_id').references(() => connectorApps.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['mcp', 'channel'] })
      .notNull()
      .default('mcp'),
    createdAt: text('created_at').notNull().default(isoTimestamp),
    updatedAt: text('updated_at').notNull().default(isoTimestamp),
  },
  (table) => ({
    idxStatusSlug: index('idx_connectors_status_slug').on(table.status, table.slug),
    slugCheck: check(
      'connectors_slug_check',
      sql`${table.slug} GLOB '[a-z0-9]*' AND ${table.slug} NOT GLOB '*[^a-z0-9-]*' AND length(${table.slug}) >= 1`,
    ),
    sourceCheck: check(
      'connectors_source_check',
      sql`${table.source} IN ('catalog', 'custom')`,
    ),
    transportCheck: check(
      'connectors_transport_check',
      sql`${table.transport} IN ('stdio', 'remote')`,
    ),
    statusCheck: check(
      'connectors_status_check',
      sql`${table.status} IN ('enabled', 'disabled', 'pending')`,
    ),
    kindCheck: check('connectors_kind_check', sql`${table.kind} IN ('mcp', 'channel')`),
  }),
);

export const connectorSecrets = sqliteTable(
  'connector_secrets',
  {
    connectorId: text('connector_id')
      .notNull()
      .references(() => connectors.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    isPublic: integer('is_public').notNull().default(0),
    valueEncrypted: blob('value_encrypted', { mode: 'buffer' }).notNull(),
    iv: blob('iv', { mode: 'buffer' }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.connectorId, table.key] }),
  }),
);

export const connectorToolPermissions = sqliteTable(
  'connector_tool_permissions',
  {
    connectorId: text('connector_id')
      .notNull()
      .references(() => connectors.id, { onDelete: 'cascade' }),
    toolName: text('tool_name').notNull(),
    description: text('description'),
    category: text('category', { enum: ['read', 'write', 'interactive'] }).notNull(),
    permission: text('permission', { enum: ['always_allow', 'ask', 'never'] }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.connectorId, table.toolName] }),
    idxConnector: index('idx_connector_tool_permissions_connector').on(table.connectorId),
    categoryCheck: check(
      'connector_tool_permissions_category_check',
      sql`${table.category} IN ('read', 'write', 'interactive')`,
    ),
    permissionCheck: check(
      'connector_tool_permissions_permission_check',
      sql`${table.permission} IN ('always_allow', 'ask', 'never')`,
    ),
  }),
);

export const connectorInvocations = sqliteTable(
  'connector_invocations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    connectorId: text('connector_id')
      .notNull()
      .references(() => connectors.id, { onDelete: 'cascade' }),
    toolName: text('tool_name').notNull(),
    threadId: text('thread_id'),
    correlationId: text('correlation_id'),
    result: text('result', { enum: ['ok', 'error'] }).notNull(),
    durationMs: integer('duration_ms').notNull(),
    errorMessage: text('error_message'),
    createdAt: text('created_at').notNull().default(isoTimestamp),
  },
  (table) => ({
    idxConnectorCreated: index('idx_connector_invocations_connector_created').on(
      table.connectorId,
      sql`${table.createdAt} DESC`,
    ),
    idxThread: index('idx_connector_invocations_thread').on(table.threadId),
    resultCheck: check(
      'connector_invocations_result_check',
      sql`${table.result} IN ('ok', 'error')`,
    ),
  }),
);

export const skills = sqliteTable(
  'skills',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull().unique(),
    description: text('description').notNull(),
    source: text('source', { enum: ['zeno_default', 'profile', 'dashboard'] })
      .notNull()
      .default('dashboard'),
    createdAt: text('created_at').notNull().default(isoTimestamp),
    updatedAt: text('updated_at').notNull().default(isoTimestamp),
  },
  (table) => ({
    idxName: index('idx_skills_name').on(table.name),
    idxSource: index('idx_skills_source').on(table.source),
    sourceCheck: check(
      'skills_source_check',
      sql`${table.source} IN ('zeno_default', 'profile', 'dashboard')`,
    ),
  }),
);

export const connectorSkills = sqliteTable(
  'connector_skills',
  {
    connectorId: text('connector_id')
      .notNull()
      .references(() => connectors.id, { onDelete: 'cascade' }),
    skillId: text('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    createdAt: text('created_at').notNull().default(isoTimestamp),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.connectorId, table.skillId] }),
    idxSkill: index('idx_connector_skills_skill').on(table.skillId),
  }),
);

export const agentCapabilities = sqliteTable(
  'agent_capabilities',
  {
    toolName: text('tool_name').primaryKey(),
    enabled: integer('enabled').notNull().default(0),
    updatedAt: text('updated_at').notNull().default(isoTimestamp),
  },
  (table) => ({
    enabledCheck: check('agent_capabilities_enabled_check', sql`${table.enabled} IN (0, 1)`),
  }),
);

export const cronSkills = sqliteTable(
  'cron_skills',
  {
    cronId: text('cron_id')
      .notNull()
      .references(() => crons.id, { onDelete: 'cascade' }),
    skillId: text('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    createdAt: text('created_at').notNull().default(isoTimestamp),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.cronId, table.skillId] }),
    idxSkill: index('idx_cron_skills_skill').on(table.skillId),
  }),
);

export const cronConnectors = sqliteTable(
  'cron_connectors',
  {
    cronId: text('cron_id')
      .notNull()
      .references(() => crons.id, { onDelete: 'cascade' }),
    connectorId: text('connector_id')
      .notNull()
      .references(() => connectors.id, { onDelete: 'cascade' }),
    createdAt: text('created_at').notNull().default(isoTimestamp),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.cronId, table.connectorId] }),
    idxConnector: index('idx_cron_connectors_connector').on(table.connectorId),
  }),
);

export const backendCredentials = sqliteTable(
  'backend_credentials',
  {
    id: text('id').primaryKey(),
    profileId: text('profile_id').notNull(),
    backendId: text('backend_id').notNull(),
    fieldName: text('field_name').notNull(),
    valueEncrypted: blob('value_encrypted', { mode: 'buffer' }).notNull(),
    iv: blob('iv', { mode: 'buffer' }).notNull(),
    status: text('status', { enum: ['untested', 'active', 'expired', 'failed'] })
      .notNull()
      .default('untested'),
    lastTestedAt: integer('last_tested_at'),
    lastAuthAlertAt: integer('last_auth_alert_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    profileBackendFieldUnique: uniqueIndex('backend_credentials_profile_backend_field_unique').on(
      table.profileId,
      table.backendId,
      table.fieldName,
    ),
    idxProfileBackend: index('idx_backend_credentials_profile_backend').on(
      table.profileId,
      table.backendId,
    ),
    statusCheck: check(
      'backend_credentials_status_check',
      sql`${table.status} IN ('untested', 'active', 'expired', 'failed')`,
    ),
  }),
);

export const backendSettings = sqliteTable(
  'backend_settings',
  {
    profileId: text('profile_id').notNull(),
    key: text('key').notNull(),
    value: text('value').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.profileId, table.key] }),
  }),
);

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type Cron = typeof crons.$inferSelect;
export type NewCron = typeof crons.$inferInsert;

export type CronRun = typeof cronRuns.$inferSelect;
export type NewCronRun = typeof cronRuns.$inferInsert;

export type Command = typeof commands.$inferSelect;
export type NewCommand = typeof commands.$inferInsert;

export type Log = typeof logs.$inferSelect;
export type NewLog = typeof logs.$inferInsert;

export type ConnectorApp = typeof connectorApps.$inferSelect;
export type NewConnectorApp = typeof connectorApps.$inferInsert;

export type Connector = typeof connectors.$inferSelect;
export type NewConnector = typeof connectors.$inferInsert;

export type ConnectorSecret = typeof connectorSecrets.$inferSelect;
export type NewConnectorSecret = typeof connectorSecrets.$inferInsert;

export type ConnectorToolPermission = typeof connectorToolPermissions.$inferSelect;
export type NewConnectorToolPermission = typeof connectorToolPermissions.$inferInsert;

export type ConnectorInvocation = typeof connectorInvocations.$inferSelect;
export type NewConnectorInvocation = typeof connectorInvocations.$inferInsert;

export type Skill = typeof skills.$inferSelect;
export type NewSkill = typeof skills.$inferInsert;

export type ConnectorSkill = typeof connectorSkills.$inferSelect;
export type NewConnectorSkill = typeof connectorSkills.$inferInsert;

export type AgentCapability = typeof agentCapabilities.$inferSelect;
export type NewAgentCapability = typeof agentCapabilities.$inferInsert;

export type CronSkill = typeof cronSkills.$inferSelect;
export type NewCronSkill = typeof cronSkills.$inferInsert;

export type CronConnector = typeof cronConnectors.$inferSelect;
export type NewCronConnector = typeof cronConnectors.$inferInsert;

export type BackendCredential = typeof backendCredentials.$inferSelect;
export type NewBackendCredential = typeof backendCredentials.$inferInsert;

export type BackendSetting = typeof backendSettings.$inferSelect;
export type NewBackendSetting = typeof backendSettings.$inferInsert;
