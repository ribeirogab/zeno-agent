import type { DB } from './db.js';

interface Migration {
  id: number;
  name: string;
  sql: string;
}

/**
 * All migrations, in order. Add new ones at the end. Never modify or reorder existing entries.
 * Migrations run in a transaction; failure aborts the whole batch.
 */
const MIGRATIONS: Migration[] = [
  {
    id: 1,
    name: 'init',
    sql: `
CREATE TABLE IF NOT EXISTS migrations (
  id INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  thread_id    TEXT PRIMARY KEY,
  session_id   TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS crons (
  id                       TEXT PRIMARY KEY,
  name                     TEXT NOT NULL,
  description              TEXT,
  prompt                   TEXT NOT NULL,
  schedule                 TEXT NOT NULL,
  enabled                  INTEGER NOT NULL DEFAULT 1,
  source                   TEXT NOT NULL,
  created_by               TEXT,
  notify_conversation_id   TEXT,
  notify_thread_id         TEXT,
  created_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_run_at              TEXT,
  next_run_at              TEXT
);

CREATE INDEX IF NOT EXISTS idx_crons_enabled_next_run ON crons(enabled, next_run_at);

CREATE TABLE IF NOT EXISTS cron_runs (
  id           TEXT PRIMARY KEY,
  cron_id      TEXT NOT NULL REFERENCES crons(id) ON DELETE CASCADE,
  started_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at  TEXT,
  status       TEXT NOT NULL,
  output       TEXT,
  error        TEXT
);

CREATE INDEX IF NOT EXISTS idx_cron_runs_cron ON cron_runs(cron_id, started_at DESC);
`,
  },
  {
    id: 2,
    name: 'commands',
    sql: `
CREATE TABLE commands (
  id             TEXT PRIMARY KEY,
  type           TEXT NOT NULL,
  payload        TEXT,
  status         TEXT NOT NULL DEFAULT 'pending',
  created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at   TEXT,
  completed_at   TEXT,
  result         TEXT,
  correlation_id TEXT NOT NULL
);

CREATE INDEX commands_pending_idx ON commands(status, created_at) WHERE status = 'pending';
`,
  },
];

/**
 * Apply pending migrations in order. Each migration's SQL runs in a transaction.
 * After success, the migration id is recorded in the migrations table.
 * Returns the list of newly applied ids and the highest known migration id.
 */
export function runMigrations(db: DB): { applied: number[]; current: number } {
  // The migrations table itself is created by migration 1, but we need it to read
  // applied ids. Bootstrap: try to read; if the table doesn't exist, treat as empty.
  let appliedIds = new Set<number>();
  try {
    const rows = db.prepare('SELECT id FROM migrations').all() as Array<{ id: number }>;
    appliedIds = new Set(rows.map((r) => r.id));
  } catch {
    // migrations table doesn't exist yet — first run
  }

  const newlyApplied: number[] = [];

  for (const migration of MIGRATIONS) {
    if (appliedIds.has(migration.id)) continue;
    const apply = db.transaction(() => {
      db.exec(migration.sql);
      db.prepare('INSERT OR REPLACE INTO migrations (id) VALUES (?)').run(migration.id);
    });
    apply();
    newlyApplied.push(migration.id);
  }

  const current = MIGRATIONS.length > 0 ? (MIGRATIONS[MIGRATIONS.length - 1] as Migration).id : 0;
  return { applied: newlyApplied, current };
}
