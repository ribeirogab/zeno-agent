export interface Session {
  threadId: string;
  sessionId: string;
  createdAt: string;
  lastUsedAt: string;
}

export type CronSource = 'static' | 'chat';
// CronRunStatus is consumed by CronRunRepo's finish(); exported for callers (cron runner, dashboard) in later specs.
export type CronRunStatus = 'running' | 'success' | 'failed' | 'skipped';

export interface Cron {
  id: string;
  name: string;
  description: string | null;
  prompt: string;
  schedule: string;
  enabled: boolean;
  source: CronSource;
  createdBy: string | null;
  notifyConversationId: string | null;
  notifyThreadId: string | null;
  createdAt: string;
  updatedAt: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

export interface CreateCronInput {
  id?: string;
  name: string;
  description?: string | null;
  prompt: string;
  schedule: string;
  enabled?: boolean;
  source: CronSource;
  createdBy?: string | null;
  notifyConversationId?: string | null;
  notifyThreadId?: string | null;
  nextRunAt?: string | null;
}

export interface UpdateCronInput {
  name?: string;
  description?: string | null;
  prompt?: string;
  schedule?: string;
  enabled?: boolean;
  notifyConversationId?: string | null;
  notifyThreadId?: string | null;
  lastRunAt?: string | null;
  nextRunAt?: string | null;
}

export interface CronRun {
  id: string;
  cronId: string;
  startedAt: string;
  finishedAt: string | null;
  status: CronRunStatus;
  output: string | null;
  error: string | null;
}

export type CommandType =
  | 'cron_create'
  | 'cron_pause'
  | 'cron_resume'
  | 'cron_run_now'
  | 'cron_delete'
  | 'worker_restart'
  | 'connector_create'
  | 'connector_update'
  | 'connector_refresh_tools'
  | 'connector_uninstall'
  // Spec 0044: GitHub App lifecycle commands. Spec 0051: `app_pem_rotated`
  // removed (rotate-PEM feature retired; uninstall+reinstall is the path).
  | 'app_install'
  | 'app_uninstall';

export type CommandStatus = 'pending' | 'processing' | 'success' | 'failed';

export interface Command {
  id: string;
  type: CommandType;
  payload: string | null;
  status: CommandStatus;
  createdAt: string;
  processedAt: string | null;
  completedAt: string | null;
  result: string | null;
  correlationId: string;
}

export interface CreateCommandInput {
  type: CommandType;
  payload?: unknown;
  correlationId: string;
}

export type LogLevel = 10 | 20 | 30 | 40 | 50 | 60;

export interface Log {
  id: number;
  ts: string;
  level: LogLevel;
  service: string;
  event: string | null;
  correlationId: string | null;
  message: string | null;
  payload: string;
}

export interface CreateLogInput {
  ts: string;
  level: LogLevel;
  service: string;
  event: string | null;
  correlationId: string | null;
  message: string | null;
  payload: string;
}

export interface LogFilter {
  level?: LogLevel;
  q?: string;
  since?: string;
  until?: string;
  cursorId?: number;
  sinceId?: number;
  limit?: number;
}

// ───────────────────────────────────────────────────────────────────
// Connectors (spec 0032)
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
  /** Spec 0057: discriminator. Defaults to 'mcp' for legacy + new MCP connectors; 'channel' for channel transports (Slack, future Telegram/WhatsApp). */
  kind: ConnectorKind;
}

// Spec 0044: github App row. One per (catalog_id, app_id). Holds the PEM
// once instead of duplicating it across each installation row.
export interface ConnectorApp {
  id: string;
  catalogId: string;
  /** Numeric GitHub App id (e.g. '12345'). */
  appId: string;
  /** Slug returned by GET /app (e.g. 'acme-bot'). */
  appSlug: string;
  /** Display name returned by GET /app. */
  appName: string;
  /** Full PEM body (RSA private key). Treated as a secret. */
  pem: string;
  /** sha256 of the trimmed PEM body. Used by the UI to display fingerprints. */
  pemSha256: string;
  // Spec 0051: `pemRotatedAt` field removed (rotate-PEM feature retired).
  // The DB column `pem_rotated_at` remains as legacy (no readers/writers).
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
  /** Spec 0057: optional discriminator. Defaults to 'mcp' at the repo INSERT for backward compat with existing callers. Channel installs pass 'channel'. */
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

// Spec 0052: skills are content-only markdown playbooks. Capabilities are
// global (see AgentCapability below), not per-skill.
//
// Spec 0053: `source` tracks origin so the boot seeder + API can apply the
// right ownership rules. `zeno_default` is shipped with Zeno (immutable via
// API, UPSERT'd from `agent/skills/`); `profile` is shipped with the active
// profile (INSERT OR IGNORE seed; editable via dashboard); `dashboard` is
// uploaded via the API like in spec 0052.
export type SkillSource = 'zeno_default' | 'profile' | 'dashboard';

export interface Skill {
  id: string;
  name: string;
  description: string;
  body: string;
  source: SkillSource;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSkillInput {
  name: string;
  description: string;
  body: string;
  /** Spec 0053. Defaults to 'dashboard' for backward compat with spec 0052 uploads. */
  source?: SkillSource;
}

export interface UpdateSkillInput {
  description?: string;
  body?: string;
}

// M:N link between connectors and skills. Pre-tool-use hook injects linked
// skill bodies into context before the connector's tools fire (spec 0052).
export interface ConnectorSkillLink {
  connectorId: string;
  skillId: string;
  createdAt: string;
}

// Spec 0054: M:N link between crons and skills. Force-injection — the runner
// prepends linked skill bodies to the cron prompt as a [zeno_context] block
// before calling backend.query().
export interface CronSkillLink {
  cronId: string;
  skillId: string;
  createdAt: string;
}

// Spec 0054: M:N link between crons and connectors. Hint mode — listed slugs
// are surfaced in the [zeno_context] block as preferred, but the connector-
// permission gate stays the single allow/deny authority (spec 0050).
export interface CronConnectorLink {
  cronId: string;
  connectorId: string;
  createdAt: string;
}

// Spec 0052: global non-MCP tool toggles. Operator opts in via /settings.
// Gate (connector-permission.ts) consults isEnabled(toolName) before allowing
// non-MCP tools (Read/Edit/Write/Bash/etc.).
export interface AgentCapability {
  toolName: string;
  enabled: boolean;
  updatedAt: string;
}

export interface AgentCapabilityUpdate {
  toolName: string;
  enabled: boolean;
}
