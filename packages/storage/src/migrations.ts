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
  {
    id: 3,
    name: 'logs',
    sql: `
    CREATE TABLE logs (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      ts             TEXT NOT NULL,
      level          INTEGER NOT NULL,
      service        TEXT NOT NULL,
      event          TEXT,
      correlation_id TEXT,
      message        TEXT,
      payload        TEXT NOT NULL
    );
    CREATE INDEX logs_ts_desc_idx ON logs(ts DESC);
    CREATE INDEX logs_level_idx ON logs(level);
    CREATE INDEX logs_event_idx ON logs(event);
    CREATE INDEX logs_correlation_idx ON logs(correlation_id);
  `,
  },
  {
    id: 4,
    name: 'approvals_log',
    sql: `
CREATE TABLE approvals_log (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  profile            TEXT NOT NULL,
  correlation_id     TEXT NOT NULL,
  thread_id          TEXT,
  requester_user_id  TEXT NOT NULL,
  decider_user_id    TEXT,
  tool_name          TEXT NOT NULL,
  tool_input         TEXT NOT NULL,
  policy_that_gated  TEXT NOT NULL,
  classifier_reason  TEXT,
  decision           TEXT NOT NULL CHECK (decision IN ('allow','deny')),
  decision_reason    TEXT NOT NULL,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_approvals_log_profile_created ON approvals_log(profile, created_at DESC);
CREATE INDEX idx_approvals_log_correlation ON approvals_log(correlation_id);
`,
  },
  {
    id: 5,
    name: 'connectors',
    sql: `
CREATE TABLE connectors (
  id               TEXT PRIMARY KEY,
  slug             TEXT NOT NULL UNIQUE
                    CHECK (slug GLOB '[a-z0-9]*' AND slug NOT GLOB '*[^a-z0-9-]*' AND length(slug) >= 1),
  display_name     TEXT NOT NULL,
  description      TEXT,
  source           TEXT NOT NULL CHECK (source IN ('catalog','custom')),
  catalog_id       TEXT,
  transport        TEXT NOT NULL CHECK (transport IN ('stdio','remote')),
  command          TEXT,
  args             TEXT,
  url              TEXT,
  status           TEXT NOT NULL CHECK (status IN ('enabled','disabled','pending')) DEFAULT 'enabled',
  last_error       TEXT,
  last_error_at    TEXT,
  last_verified_at TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_connectors_status_slug ON connectors(status, slug);

CREATE TABLE connector_secrets (
  connector_id TEXT NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
  key          TEXT NOT NULL,
  value        TEXT NOT NULL,
  PRIMARY KEY (connector_id, key)
);

CREATE TABLE connector_tool_permissions (
  connector_id TEXT NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
  tool_name    TEXT NOT NULL,
  description  TEXT,
  category     TEXT NOT NULL CHECK (category IN ('read','write','interactive')),
  permission   TEXT NOT NULL CHECK (permission IN ('always_allow','ask','never')),
  PRIMARY KEY (connector_id, tool_name)
);
CREATE INDEX idx_connector_tool_permissions_connector ON connector_tool_permissions(connector_id);

CREATE TABLE connector_invocations (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  connector_id   TEXT NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
  tool_name      TEXT NOT NULL,
  thread_id      TEXT,
  correlation_id TEXT,
  result         TEXT NOT NULL CHECK (result IN ('ok','error')),
  duration_ms    INTEGER NOT NULL,
  error_message  TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_connector_invocations_connector_created ON connector_invocations(connector_id, created_at DESC);
CREATE INDEX idx_connector_invocations_thread ON connector_invocations(thread_id);
`,
  },
  {
    id: 6,
    name: 'github_app_v2_dedup',
    // Spec 0044: introduce a dedicated `connector_apps` table so the App PEM /
    // app id / metadata is held once (not duplicated across N installation
    // rows), enable atomic PEM rotation, and let the dashboard render the
    // App as a first-class entity. Backfills the existing 4 `github-app-*`
    // rows in-place during the same transaction; subsequent boots are no-ops.
    sql: `
CREATE TABLE connector_apps (
  id              TEXT PRIMARY KEY,
  catalog_id      TEXT NOT NULL,
  app_id          TEXT NOT NULL,
  app_slug        TEXT NOT NULL,
  app_name        TEXT NOT NULL,
  pem             TEXT NOT NULL,
  pem_sha256      TEXT NOT NULL,
  pem_rotated_at  TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (catalog_id, app_id)
);
CREATE INDEX idx_connector_apps_catalog ON connector_apps(catalog_id);

ALTER TABLE connectors ADD COLUMN app_id TEXT REFERENCES connector_apps(id) ON DELETE CASCADE;
ALTER TABLE connector_secrets ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0;

-- Data migration. Idempotent: gated on connector_apps having no row for
-- catalog_id='github-app'. Reads __GITHUB_APP_ID__ + __GITHUB_APP_PEM__ from
-- the first existing github-app-* connector and inserts a single row;
-- app_slug / app_name / pem_sha256 are left as empty strings here and
-- backfilled lazily on first worker boot via loadGitHubAppFromDb (see
-- spec 0044 §Migration). connectors.app_id is then pointed at this new row.
-- The five reserved-key secrets that are now redundant (__GITHUB_APP_ID__,
-- __GITHUB_APP_PEM__) are deleted; the per-installation keys
-- (__GITHUB_INSTALLATION_ID__, __GITHUB_INSTALLATION_NAME__,
-- __GITHUB_ENV_VAR__) stay.
-- Generate a UUID v4-shaped id so migration-bootstrapped rows match the
-- format produced by node:crypto.randomUUID() at runtime
-- (8-4-4-4-12 lowercase hex). Spec 0044 review F3.
INSERT INTO connector_apps (id, catalog_id, app_id, app_slug, app_name, pem, pem_sha256)
SELECT
  lower(
    substr(hex(randomblob(4)), 1, 8) || '-' ||
    substr(hex(randomblob(2)), 1, 4) || '-' ||
    '4' || substr(hex(randomblob(2)), 2, 3) || '-' ||
    substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2, 3) || '-' ||
    substr(hex(randomblob(6)), 1, 12)
  ),
  'github-app',
  (SELECT s.value FROM connector_secrets s
     JOIN connectors c2 ON c2.id = s.connector_id
     WHERE c2.slug LIKE 'github-app-%' AND s.key = '__GITHUB_APP_ID__' LIMIT 1),
  '',
  '',
  (SELECT s.value FROM connector_secrets s
     JOIN connectors c2 ON c2.id = s.connector_id
     WHERE c2.slug LIKE 'github-app-%' AND s.key = '__GITHUB_APP_PEM__' LIMIT 1),
  ''
WHERE NOT EXISTS (SELECT 1 FROM connector_apps WHERE catalog_id = 'github-app')
  AND EXISTS (
    SELECT 1 FROM connectors c2
    JOIN connector_secrets s ON s.connector_id = c2.id
    WHERE c2.slug LIKE 'github-app-%' AND s.key = '__GITHUB_APP_ID__'
  );

UPDATE connectors
SET app_id = (SELECT id FROM connector_apps WHERE catalog_id = 'github-app' LIMIT 1)
WHERE slug LIKE 'github-app-%' AND app_id IS NULL;

DELETE FROM connector_secrets
WHERE key IN ('__GITHUB_APP_ID__', '__GITHUB_APP_PEM__')
  AND connector_id IN (SELECT id FROM connectors WHERE slug LIKE 'github-app-%');
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
