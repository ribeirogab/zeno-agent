import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import {
  AgentCapabilityRepo,
  BackendCredentialsRepo,
  BackendSettingsRepo,
  CommandRepo,
  ConnectorAppRepo,
  ConnectorRepo,
  ConnectorSkillRepo,
  CronConnectorRepo,
  CronRepo,
  CronRunRepo,
  CronSkillRepo,
  LogRepo,
  openRuntimeDatabase,
  runRuntimeMigrations,
  SkillRepo,
} from '@zeno/db/runtime';
import { createLogger } from '@zeno/logger';
import { loadApiConfig } from '@/config';
import { loadChannelsCatalog } from '@/lib/channels-catalog-loader';
import { createApp } from '@/server';

// Mirror the worker's PROFILE_CANDIDATES: container path first, dev fallback second.
const PROFILE_CANDIDATES = ['/app/profile', 'profile'];

function resolveProfileDir(): string {
  for (const candidate of PROFILE_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  return PROFILE_CANDIDATES[PROFILE_CANDIDATES.length - 1] as string;
}

const KNOWLEDGE_CANDIDATES = ['/app/knowledge', 'knowledge'];

function resolveKnowledgeDir(): string {
  for (const candidate of KNOWLEDGE_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  return KNOWLEDGE_CANDIDATES[KNOWLEDGE_CANDIDATES.length - 1] as string;
}

// Bootstrap logger for messages that happen before the DB is open. Once the
// LogRepo exists we swap to a runtime logger wired to the dbSink so every
// log line also lands in the logs table (powering the Logs page).
const bootLogger = createLogger({ service: 'api' });

function main(): void {
  const config = loadApiConfig();
  bootLogger.info({ event: 'api_boot_start' }, 'api booting');
  const dbPath = join(config.workspaceDir, 'zeno.db');
  const opened = openRuntimeDatabase(dbPath);
  const db = opened.drizzle;
  runRuntimeMigrations(opened.raw);
  const cronRepo = new CronRepo(db);
  const cronRunRepo = new CronRunRepo(db);
  const commandRepo = new CommandRepo(db);
  const logRepo = new LogRepo(db);
  const connectorRepo = new ConnectorRepo(db, {
    masterKey: config.masterKey,
    profileId: config.profileId,
  });
  const connectorAppRepo = new ConnectorAppRepo(db);
  // Spec 0062: SkillRepo takes per-source roots so canonicalPath(skill) can
  // resolve into a real FS dir. The API uses the in-container paths
  // (mirrored from docker-compose mounts). The /workspace/skills/ volume
  // is writable; agent + profile are read-only.
  const skillRepo = new SkillRepo(db, {
    agentSkillsRoot: '/app/agent/skills',
    profileSkillsRoot: '/app/profile/skills',
    dashboardSkillsRoot: join(config.workspaceDir, 'skills'),
  });
  const connectorSkillRepo = new ConnectorSkillRepo(db);
  const cronSkillRepo = new CronSkillRepo(db);
  const cronConnectorRepo = new CronConnectorRepo(db);
  const agentCapabilityRepo = new AgentCapabilityRepo(db);
  // Spec 0071: backend auth via dashboard.
  const backendCredentialsRepo = new BackendCredentialsRepo(db, {
    masterKey: config.masterKey,
    profileId: config.profileId,
  });
  const backendSettingsRepo = new BackendSettingsRepo(db, config.profileId);
  const logger = createLogger({ service: 'api', dbSink: logRepo });
  const here = dirname(fileURLToPath(import.meta.url));
  // After build: apps/api/dist/index.js → ../.. → apps → /dashboard/dist
  const spaDir = join(here, '..', '..', 'dashboard', 'dist');
  // Claude Code JSONL transcripts live under $HOME/.claude/projects/-workspace/<sessionId>.jsonl.
  // In the container, the worker user's home is /home/node, so this resolves to the shared volume.
  const claudeHome = join(homedir(), '.claude', 'projects', '-workspace');
  // Spec 0052: skill SKILL.md files live one directory up at $HOME/.claude/skills/.
  const claudeHomeRoot = join(homedir(), '.claude');
  const profileDir = resolveProfileDir();
  const knowledgeRoot = resolveKnowledgeDir();
  // Spec 0057: load channels catalog at boot. If the file is missing/malformed,
  // log + omit the dep — /api/channels/* routes won't mount, but the rest of
  // the API keeps working (parallel to how missing connector-apps repo behaves).
  let channelsCatalog: ReturnType<typeof loadChannelsCatalog> | undefined;
  try {
    channelsCatalog = loadChannelsCatalog();
  } catch (err) {
    logger.warn(
      { event: 'channels_catalog_load_failed', err: String(err) },
      'channels catalog load failed; /api/channels routes will not mount',
    );
  }
  const app = createApp({
    config,
    db,
    cronRepo,
    cronRunRepo,
    commandRepo,
    logRepo,
    connectorRepo,
    connectorAppRepo,
    skillRepo,
    connectorSkillRepo,
    cronSkillRepo,
    cronConnectorRepo,
    agentCapabilityRepo,
    backendCredentialsRepo,
    backendSettingsRepo,
    claudeHome,
    claudeHomeRoot,
    profileDir,
    knowledgeRoot,
    spaDir,
    ...(channelsCatalog ? { channelsCatalog } : {}),
  });
  const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
    logger.info({ event: 'api_listening', port: info.port }, `api listening on :${info.port}`);
  });
  const shutdown = (signal: string): void => {
    logger.info({ event: 'api_shutdown', signal }, 'api shutting down');
    server.close();
    opened.close();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
