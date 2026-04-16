import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { createLogger } from '@zeno/logger';
import {
  CommandRepo,
  CronRepo,
  CronRunRepo,
  closeDatabase,
  openDatabase,
  runMigrations,
} from '@zeno/storage';
import { loadApiConfig } from '@/config';
import { createApp } from '@/server';

const logger = createLogger({ service: 'api' });

function main(): void {
  const config = loadApiConfig();
  logger.info({ event: 'api_boot_start' }, 'api booting');
  const dbPath = join(config.workspaceDir, 'zeno.db');
  const db = openDatabase(dbPath);
  runMigrations(db);
  const cronRepo = new CronRepo(db);
  const cronRunRepo = new CronRunRepo(db);
  const commandRepo = new CommandRepo(db);
  const here = dirname(fileURLToPath(import.meta.url));
  // After build: apps/api/dist/index.js → ../.. → apps → /dashboard/dist
  const spaDir = join(here, '..', '..', 'dashboard', 'dist');
  // Claude Code JSONL transcripts live under $HOME/.claude/projects/-workspace/<sessionId>.jsonl.
  // In the container, the worker user's home is /home/node, so this resolves to the shared volume.
  const claudeHome = join(homedir(), '.claude', 'projects', '-workspace');
  const app = createApp({
    config,
    db,
    cronRepo,
    cronRunRepo,
    commandRepo,
    claudeHome,
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
