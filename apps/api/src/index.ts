import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { createLogger } from '@zeno/logger';
import {
  CommandRepo,
  CronRepo,
  CronRunRepo,
  LogRepo,
  closeDatabase,
  openDatabase,
  runMigrations,
} from '@zeno/storage';
import { loadApiConfig } from '@/config';
import { createApp } from '@/server';

// Mirror the worker's PROFILE_CANDIDATES: container path first, dev fallback second.
const PROFILE_CANDIDATES = ['/app/profile', 'profile'];

function resolveProfileDir(): string {
  for (const candidate of PROFILE_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  return PROFILE_CANDIDATES[PROFILE_CANDIDATES.length - 1] as string;
}

// Bootstrap logger for messages that happen before the DB is open. Once the
// LogRepo exists we swap to a runtime logger wired to the dbSink so every
// log line also lands in the logs table (powering the Logs page).
const bootLogger = createLogger({ service: 'api' });

function main(): void {
  const config = loadApiConfig();
  bootLogger.info({ event: 'api_boot_start' }, 'api booting');
  const dbPath = join(config.workspaceDir, 'zeno.db');
  const db = openDatabase(dbPath);
  runMigrations(db);
  const cronRepo = new CronRepo(db);
  const cronRunRepo = new CronRunRepo(db);
  const commandRepo = new CommandRepo(db);
  const logRepo = new LogRepo(db);
  const logger = createLogger({ service: 'api', dbSink: logRepo });
  const here = dirname(fileURLToPath(import.meta.url));
  // After build: apps/api/dist/index.js → ../.. → apps → /dashboard/dist
  const spaDir = join(here, '..', '..', 'dashboard', 'dist');
  // Claude Code JSONL transcripts live under $HOME/.claude/projects/-workspace/<sessionId>.jsonl.
  // In the container, the worker user's home is /home/node, so this resolves to the shared volume.
  const claudeHome = join(homedir(), '.claude', 'projects', '-workspace');
  const profileDir = resolveProfileDir();
  const app = createApp({
    config,
    db,
    cronRepo,
    cronRunRepo,
    commandRepo,
    logRepo,
    claudeHome,
    profileDir,
    spaDir,
  });
  const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
    logger.info({ event: 'api_listening', port: info.port }, `api listening on :${info.port}`);
  });
  const shutdown = (signal: string): void => {
    logger.info({ event: 'api_shutdown', signal }, 'api shutting down');
    server.close();
    closeDatabase(db);
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
