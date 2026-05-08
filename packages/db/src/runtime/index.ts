// Boot helpers

// Crypto
export { decrypt, type EncryptedBlob, encrypt } from './crypto.js';
export type { OpenRuntimeDatabase, RuntimeDB } from './db.js';
export { openRuntimeDatabase, runRuntimeMigrations } from './db.js';
export type { AgentCapability, AgentCapabilityUpdate } from './repos/agent-capabilities.js';

// Repos
export { AgentCapabilityRepo } from './repos/agent-capabilities.js';
export type {
  BackendCredentialStatus,
  BackendStatus,
} from './repos/backend-credentials.js';

export { BackendCredentialsRepo } from './repos/backend-credentials.js';
export { BackendSettingsRepo } from './repos/backend-settings.js';
export type {
  Command,
  CommandStatus,
  CommandType,
  CreateCommandInput,
} from './repos/commands.js';

export { CommandRepo } from './repos/commands.js';
export type {
  ConnectorApp,
  CreateConnectorAppInput,
  UpdateConnectorAppInput,
} from './repos/connector-apps.js';

export { ConnectorAppRepo } from './repos/connector-apps.js';
export type { ConnectorSkillLink } from './repos/connector-skills.js';

export { ConnectorSkillRepo } from './repos/connector-skills.js';
export type {
  Connector,
  ConnectorInvocation,
  ConnectorKind,
  ConnectorRepoCryptoOpts,
  ConnectorSecret,
  ConnectorSource,
  ConnectorStatus,
  ConnectorToolPermission,
  ConnectorTransport,
  ConnectorWithRelations,
  CreateConnectorInput,
  InvocationResult,
  ListConnectorsFilter,
  RecordInvocationInput,
  ToolCategory,
  ToolPermission,
  UpdateConnectorInput,
} from './repos/connectors.js';

export { ConnectorRepo } from './repos/connectors.js';
export type { CronConnectorLink } from './repos/cron-connectors.js';

export { CronConnectorRepo } from './repos/cron-connectors.js';
export type { CronRun, CronRunStatus } from './repos/cron-runs.js';

export { CronRunRepo } from './repos/cron-runs.js';
export type { CronSkillLink } from './repos/cron-skills.js';

export { CronSkillRepo } from './repos/cron-skills.js';
export type {
  CreateCronInput,
  Cron,
  CronSource,
  UpdateCronInput,
} from './repos/crons.js';

export { CronRepo } from './repos/crons.js';
export type { CreateLogInput, Log, LogFilter, LogLevel } from './repos/logs.js';

export { LogRepo } from './repos/logs.js';
export type { Session } from './repos/sessions.js';

export { SessionRepo } from './repos/sessions.js';
export type {
  CreateSkillInput,
  Skill,
  SkillRoots,
  SkillSource,
  UpdateSkillInput,
} from './repos/skills.js';

export { SkillRepo } from './repos/skills.js';
// Seed helpers
export { seedDefaultAgentCapabilities, seedDefaultConnectors } from './seed.js';
