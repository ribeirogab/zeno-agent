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
  {
    id: 7,
    name: 'github_app_v2_backfill_tools',
    // Spec 0045: data fix for the 4 existing github-app-* connectors that
    // shipped with empty connector_tool_permissions in spec 0042. Backfills
    // tool permissions from the `github` (Personal) catalog entry's tool list,
    // frozen at migration-write time. The 51-row VALUES table below was
    // generated from `agent/connectors-catalog.json`'s `github` entry; if the
    // catalog evolves, only NEW github-app-* installs get the updated tools
    // (via the install endpoint, which reads the live catalog).
    //
    // Idempotent: NOT EXISTS guard prevents re-insert on re-run; runner
    // records id=7 only on full success.
    // SQLite supports VALUES inside FROM, but does NOT support AS v(col1,
    // col2,...) column aliasing. Use the implicit column1/column2/... names.
    sql: `
INSERT INTO connector_tool_permissions (connector_id, tool_name, description, category, permission)
SELECT
  c.id,
  t.column1,
  t.column2,
  t.column3,
  t.column4
FROM connectors c
CROSS JOIN (VALUES
  ('add_issue_comment', 'Add a comment to a specific issue in a GitHub repository.', 'interactive', 'ask'),
  ('add_pull_request_review_comment_to_pending_review', 'Add a comment to the requester''s latest pending pull request review, a pending review needs to already exist to call this (check with the user if not sure).', 'interactive', 'ask'),
  ('assign_copilot_to_issue', 'Assign Copilot to a specific issue in a GitHub repository.', 'interactive', 'ask'),
  ('dismiss_notification', 'Dismiss a notification by marking it as read or done', 'interactive', 'ask'),
  ('fork_repository', 'Fork a GitHub repository to your account or specified organization', 'interactive', 'ask'),
  ('manage_notification_subscription', 'Manage a notification subscription: ignore, watch, or delete a notification thread subscription.', 'interactive', 'ask'),
  ('manage_repository_notification_subscription', 'Manage a repository notification subscription: ignore, watch, or delete repository notifications subscription for the provided repository.', 'interactive', 'ask'),
  ('mark_all_notifications_read', 'Mark all notifications as read', 'interactive', 'ask'),
  ('merge_pull_request', 'Merge a pull request in a GitHub repository.', 'interactive', 'ask'),
  ('push_files', 'Push multiple files to a GitHub repository in a single commit', 'interactive', 'ask'),
  ('request_copilot_review', 'Request a GitHub Copilot code review for a pull request.', 'interactive', 'ask'),
  ('submit_pending_pull_request_review', 'Submit the requester''s latest pending pull request review, normally this is a final step after creating a pending review, adding comments first, unless you know that the user already did the first two steps, you should check before calling this.', 'interactive', 'ask'),
  ('get_code_scanning_alert', 'Get details of a specific code scanning alert in a GitHub repository.', 'read', 'always_allow'),
  ('get_commit', 'Get details for a commit from a GitHub repository', 'read', 'always_allow'),
  ('get_file_contents', 'Get the contents of a file or directory from a GitHub repository', 'read', 'always_allow'),
  ('get_issue', 'Get details of a specific issue in a GitHub repository.', 'read', 'always_allow'),
  ('get_issue_comments', 'Get comments for a specific issue in a GitHub repository.', 'read', 'always_allow'),
  ('get_me', 'Get details of the authenticated GitHub user.', 'read', 'always_allow'),
  ('get_notification_details', 'Get detailed information for a specific GitHub notification, always call this tool when the user asks for details about a specific notification, if you don''t know the ID list notifications first.', 'read', 'always_allow'),
  ('get_pull_request', 'Get details of a specific pull request in a GitHub repository.', 'read', 'always_allow'),
  ('get_pull_request_comments', 'Get comments for a specific pull request.', 'read', 'always_allow'),
  ('get_pull_request_diff', 'Get the diff of a pull request.', 'read', 'always_allow'),
  ('get_pull_request_files', 'Get the files changed in a specific pull request.', 'read', 'always_allow'),
  ('get_pull_request_reviews', 'Get reviews for a specific pull request.', 'read', 'always_allow'),
  ('get_pull_request_status', 'Get the status of a specific pull request.', 'read', 'always_allow'),
  ('get_secret_scanning_alert', 'Get details of a specific secret scanning alert in a GitHub repository.', 'read', 'always_allow'),
  ('get_tag', 'Get details about a specific git tag in a GitHub repository', 'read', 'always_allow'),
  ('list_branches', 'List branches in a GitHub repository', 'read', 'always_allow'),
  ('list_code_scanning_alerts', 'List code scanning alerts in a GitHub repository.', 'read', 'always_allow'),
  ('list_commits', 'Get list of commits of a branch in a GitHub repository', 'read', 'always_allow'),
  ('list_issues', 'List issues in a GitHub repository.', 'read', 'always_allow'),
  ('list_notifications', 'Lists all GitHub notifications for the authenticated user, including unread notifications, mentions, review requests, assignments, and updates on issues or pull requests.', 'read', 'always_allow'),
  ('list_pull_requests', 'List pull requests in a GitHub repository.', 'read', 'always_allow'),
  ('list_secret_scanning_alerts', 'List secret scanning alerts in a GitHub repository.', 'read', 'always_allow'),
  ('list_tags', 'List git tags in a GitHub repository', 'read', 'always_allow'),
  ('search_code', 'Search for code across GitHub repositories', 'read', 'always_allow'),
  ('search_issues', 'Search for issues in GitHub repositories.', 'read', 'always_allow'),
  ('search_repositories', 'Search for GitHub repositories', 'read', 'always_allow'),
  ('search_users', 'Search for GitHub users', 'read', 'always_allow'),
  ('create_and_submit_pull_request_review', 'Create and submit a review for a pull request without review comments.', 'write', 'ask'),
  ('create_branch', 'Create a new branch in a GitHub repository', 'write', 'ask'),
  ('create_issue', 'Create a new issue in a GitHub repository.', 'write', 'ask'),
  ('create_or_update_file', 'Create or update a single file in a GitHub repository.', 'write', 'ask'),
  ('create_pending_pull_request_review', 'Create a pending review for a pull request.', 'write', 'ask'),
  ('create_pull_request', 'Create a new pull request in a GitHub repository.', 'write', 'ask'),
  ('create_repository', 'Create a new GitHub repository in your account', 'write', 'ask'),
  ('delete_file', 'Delete a file from a GitHub repository', 'write', 'ask'),
  ('delete_pending_pull_request_review', 'Delete the requester''s latest pending pull request review.', 'write', 'ask'),
  ('update_issue', 'Update an existing issue in a GitHub repository.', 'write', 'ask'),
  ('update_pull_request', 'Update an existing pull request in a GitHub repository.', 'write', 'ask'),
  ('update_pull_request_branch', 'Update the branch of a pull request with the latest changes from the base branch.', 'write', 'ask')
) AS t
WHERE c.slug LIKE 'github-app-%'
  AND NOT EXISTS (
    SELECT 1 FROM connector_tool_permissions
    WHERE connector_id = c.id
  );
`,
  },
  {
    id: 8,
    name: 'approval_rules',
    // Spec 0047: move always_sensitive rules from yaml to a DB-managed table.
    // Generic shape (pattern + source) — works for any sensitive tool across
    // any connector, with a source field that drives auto-cascade behavior.
    sql: `
CREATE TABLE approval_rules (
  id          TEXT PRIMARY KEY,
  pattern     TEXT NOT NULL,
  source      TEXT NOT NULL CHECK (source IN ('manual', 'auto', 'yaml-migrated')),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  notes       TEXT,
  UNIQUE (pattern)
);
CREATE INDEX idx_approval_rules_source ON approval_rules(source);
`,
  },
  {
    id: 9,
    name: 'connector_apps_last_refresh_error',
    // Spec 0048 Q2: refresh-failure surfacing. The worker writes the
    // timestamp + message of the most recent refresh failure; the listing
    // endpoint reads it and renders DEGRADED on the App row when within 1h.
    sql: `
ALTER TABLE connector_apps ADD COLUMN last_refresh_error_at TEXT;
ALTER TABLE connector_apps ADD COLUMN last_refresh_error_message TEXT;
`,
  },
  {
    id: 10,
    name: 'drop_approval_rules_and_approvals_log',
    // Spec 0050: connectors-only pivot. The Haiku-classifier + Slack-approval
    // flow is gone; approval_rules CRUD + approvals_log audit table have no
    // remaining writers or readers. DROP IF EXISTS for idempotency.
    sql: `
DROP INDEX IF EXISTS idx_approval_rules_source;
DROP TABLE IF EXISTS approval_rules;
DROP INDEX IF EXISTS idx_approvals_log_profile_created;
DROP INDEX IF EXISTS idx_approvals_log_correlation;
DROP TABLE IF EXISTS approvals_log;
`,
  },
  {
    id: 11,
    name: 'skills_and_agent_capabilities',
    // Spec 0052: skills as content-only markdown playbooks + global agent
    // capability toggles. M:N link between connectors and skills lets the
    // pre-tool-use hook inject linked-skill bodies before a connector's
    // tools run. Capabilities seed the 9 Claude Agent SDK non-MCP tools
    // disabled-by-default; operator opts in via /settings (Phase C of spec
    // 0052). Tool added by future SDK versions: gate denies safely until a
    // new migration seeds it.
    sql: `
CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_skills_name ON skills(name);

CREATE TABLE IF NOT EXISTS connector_skills (
  connector_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (connector_id, skill_id),
  FOREIGN KEY (connector_id) REFERENCES connectors(id) ON DELETE CASCADE,
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_connector_skills_skill ON connector_skills(skill_id);

CREATE TABLE IF NOT EXISTS agent_capabilities (
  tool_name TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

INSERT OR IGNORE INTO agent_capabilities (tool_name, enabled) VALUES
  ('Read', 0),
  ('Edit', 0),
  ('Write', 0),
  ('Bash', 0),
  ('Glob', 0),
  ('Grep', 0),
  ('WebFetch', 0),
  ('WebSearch', 0),
  ('Task', 0);
`,
  },
  {
    id: 12,
    name: 'spec 0052 follow-up: seed ToolSearch capability enabled-by-default. ToolSearch is a Claude Code harness tool that loads deferred MCP tool schemas; without it the agent cannot invoke MCP connectors registered after boot. Default-enabled because it has no side effect outside the agent context window — actual tool calls still pass through the gate. Operators can disable in /settings if they want strict harness lockdown.',
    sql: `
INSERT OR IGNORE INTO agent_capabilities (tool_name, enabled) VALUES
  ('ToolSearch', 1);
`,
  },
  {
    id: 13,
    name: 'spec 0053 — flip dev capabilities (Bash/Read/Edit/Write/Glob/Grep) to enabled-by-default. Aligns with the zeno-development default skill that Zeno ships with: every fresh install needs filesystem + shell to deliver dev work without operator setup. Sensitive/situational tools (Task/WebFetch/WebSearch) stay off, opt-in via /settings.',
    sql: `
UPDATE agent_capabilities SET enabled = 1, updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
 WHERE tool_name IN ('Bash','Read','Edit','Write','Glob','Grep');
`,
  },
  {
    id: 14,
    name: "spec 0053 — add 'source' column to skills (zeno_default | profile | dashboard). Source defaults to 'dashboard' for backward compat with spec 0052 uploads. CHECK constraint enforces the enum. SQLite cannot add a CHECK to an existing column directly, so the table is recreated. Connector_skills rows are saved + restored around the recreate because FK with ON DELETE CASCADE would otherwise wipe them when the old skills table is dropped (db.ts opens with `foreign_keys=ON`).",
    sql: `
-- Save connector_skills before recreating the skills table.
-- DROP TABLE skills with foreign_keys=ON would cascade-delete every
-- connector_skills row pointing at it; we restore them after the rebuild
-- (the new table preserves the same id values).
CREATE TEMP TABLE _spec0053_cs_backup AS SELECT * FROM connector_skills;
DELETE FROM connector_skills;

ALTER TABLE skills ADD COLUMN source TEXT;
UPDATE skills SET source = 'dashboard' WHERE source IS NULL;
CREATE TABLE skills_new (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  body TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'dashboard' CHECK (source IN ('zeno_default','profile','dashboard')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO skills_new (id, name, description, body, source, created_at, updated_at)
  SELECT id, name, description, body, source, created_at, updated_at FROM skills;
DROP TABLE skills;
ALTER TABLE skills_new RENAME TO skills;
CREATE INDEX IF NOT EXISTS idx_skills_name ON skills(name);
CREATE INDEX IF NOT EXISTS idx_skills_source ON skills(source);

-- Restore connector_skills now that the skills table is rebuilt with the
-- same id values. The FK to connectors stays valid throughout (we never
-- touched the connectors table).
INSERT INTO connector_skills (connector_id, skill_id, created_at)
  SELECT connector_id, skill_id, created_at FROM _spec0053_cs_backup;
DROP TABLE _spec0053_cs_backup;
`,
  },
  {
    id: 15,
    name: "spec 0053 follow-up — seed `Skill` capability enabled-by-default. The `Skill` tool is the Claude Code harness mechanism for invoking a skill (loading its SKILL.md body into context); without it the SDK's auto-discovery may fall back to explicit `Skill` calls which our gate denies, leaving the agent to act without the skill content. Same rationale as ToolSearch (migration 12): harness internals, not a real capability — actual tool calls still pass the gate. Operators can disable in /settings if they want strict harness lockdown. Without this, every fn-code-review test produced free-form output (## Review headers, emojis, praise) because the skill body never reached context.",
    sql: `
INSERT OR IGNORE INTO agent_capabilities (tool_name, enabled) VALUES
  ('Skill', 1);
`,
  },
  {
    id: 16,
    name: 'spec 0054 — cron_skills M:N table. Operator declares at scheduling time which skills should be force-injected when a cron fires. FK CASCADE on both sides: deleting a cron drops its links; deleting a skill drops the links pointing at it. PK (cron_id, skill_id) prevents duplicates. The runner reads via list_for_cron and prepends linked skill bodies to the cron prompt as a [zeno_context] block.',
    sql: `
CREATE TABLE cron_skills (
  cron_id TEXT NOT NULL REFERENCES crons(id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (cron_id, skill_id)
);
CREATE INDEX idx_cron_skills_skill ON cron_skills(skill_id);
`,
  },
  {
    id: 17,
    name: "spec 0054 — cron_connectors M:N table. Hint-mode link: the cron prompt receives the linked connector slugs as context (preferred set) but the connector-permission gate stays the single allow/deny authority (spec 0050 single-guardrail canon). Use of an unlinked connector is allowed by the gate but emits a 'cron_used_unlinked_connector' audit log. FK CASCADE on both sides; PK (cron_id, connector_id).",
    sql: `
CREATE TABLE cron_connectors (
  cron_id TEXT NOT NULL REFERENCES crons(id) ON DELETE CASCADE,
  connector_id TEXT NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (cron_id, connector_id)
);
CREATE INDEX idx_cron_connectors_connector ON cron_connectors(connector_id);
`,
  },
  {
    id: 18,
    name: "spec 0057 — connectors.kind discriminator ('mcp' | 'channel'). Channels share the connectors table with a discriminator column. Existing rows default to 'mcp' (additive change). The transport CHECK constraint stays unchanged; channel rows use transport='remote' as a placeholder semantically meaning 'runtime-managed adapter, no MCP spawn'. The MCP loader (apps/worker/src/agent/mcp-build.ts) guards on kind='mcp' to skip channel rows.",
    sql: `
ALTER TABLE connectors ADD COLUMN kind TEXT NOT NULL DEFAULT 'mcp'
  CHECK (kind IN ('mcp', 'channel'));
`,
  },
  {
    id: 19,
    name: "spec 0062 — drop skills.body column. Bytes move from DB to FS (each skill is now a directory tree at canonicalPath(skill) rooted in agentSkillsRoot/profileSkillsRoot/dashboardSkillsRoot per source). DB stays the catalog (id, name UNIQUE, description, source, timestamps). The pre-migration script `apps/worker/src/skills/migrate-bodies-to-fs.ts` runs BEFORE this migration to write existing dashboard bodies to /workspace/skills/ and flip diverged profile rows to source='dashboard' so no content is lost. SQLite cannot DROP COLUMN with CHECK constraints — recreate the table with the same id values, copy rows, swap. connector_skills + cron_skills FK rows are preserved by saving + restoring around the table swap (same pattern as migration 14).",
    sql: `
-- Save link tables before recreating skills (foreign_keys=ON would cascade-delete them).
CREATE TEMP TABLE _spec0062_cs_backup AS SELECT * FROM connector_skills;
DELETE FROM connector_skills;
CREATE TEMP TABLE _spec0062_crs_backup AS SELECT * FROM cron_skills;
DELETE FROM cron_skills;

CREATE TABLE skills_new (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'dashboard' CHECK (source IN ('zeno_default','profile','dashboard')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO skills_new (id, name, description, source, created_at, updated_at)
  SELECT id, name, description, source, created_at, updated_at FROM skills;
DROP TABLE skills;
ALTER TABLE skills_new RENAME TO skills;
CREATE INDEX IF NOT EXISTS idx_skills_name ON skills(name);
CREATE INDEX IF NOT EXISTS idx_skills_source ON skills(source);

-- Restore links now that the skills table is rebuilt with the same id values.
INSERT INTO connector_skills (connector_id, skill_id, created_at)
  SELECT connector_id, skill_id, created_at FROM _spec0062_cs_backup;
DROP TABLE _spec0062_cs_backup;
INSERT INTO cron_skills (cron_id, skill_id, created_at)
  SELECT cron_id, skill_id, created_at FROM _spec0062_crs_backup;
DROP TABLE _spec0062_crs_backup;
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
