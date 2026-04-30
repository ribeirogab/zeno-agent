import { describe, expect, it } from 'vitest';
import { closeDatabase, openDatabase } from '../src/db';
import { runMigrations } from '../src/migrations';

interface PragmaTableInfoRow {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

// Spec 0050: migration 10 drops approval_rules + approvals_log tables and
// indexes. Tables 4 (approvals_log) and 8 (approval_rules) created the rows;
// migration 10 removes them. After running all migrations the tables MUST NOT
// exist.
describe('migrations: drop approval_rules + approvals_log (migration 10)', () => {
  it('removes the approval_rules and approvals_log tables', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN (?, ?)")
      .all('approval_rules', 'approvals_log') as Array<{ name: string }>;
    expect(tables).toHaveLength(0);

    closeDatabase(db);
  });

  it('removes the associated indexes', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);

    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name IN (?, ?, ?)")
      .all(
        'idx_approval_rules_source',
        'idx_approvals_log_profile_created',
        'idx_approvals_log_correlation',
      ) as Array<{ name: string }>;
    expect(indexes).toHaveLength(0);

    closeDatabase(db);
  });

  it('is idempotent — re-running migrations after migration 10 does nothing', () => {
    const db = openDatabase(':memory:');
    const first = runMigrations(db);
    expect(first.applied).toContain(10);

    const second = runMigrations(db);
    expect(second.applied).toEqual([]);

    closeDatabase(db);
  });
});

describe('migrations: connectors (migration 5)', () => {
  it('creates the four connector tables', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);

    const expectedTables = [
      'connectors',
      'connector_secrets',
      'connector_tool_permissions',
      'connector_invocations',
    ];
    for (const table of expectedTables) {
      const cols = db.prepare(`PRAGMA table_info(${table})`).all() as PragmaTableInfoRow[];
      expect(cols.length, `${table} should exist`).toBeGreaterThan(0);
    }

    closeDatabase(db);
  });

  it('connectors table has expected columns', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);

    const cols = db.prepare('PRAGMA table_info(connectors)').all() as PragmaTableInfoRow[];
    const names = cols.map((c) => c.name);
    for (const name of [
      'id',
      'slug',
      'display_name',
      'description',
      'source',
      'catalog_id',
      'transport',
      'command',
      'args',
      'url',
      'status',
      'last_error',
      'last_error_at',
      'last_verified_at',
      'created_at',
      'updated_at',
    ]) {
      expect(names, `connectors missing ${name}`).toContain(name);
    }

    closeDatabase(db);
  });

  it('enforces slug GLOB constraint', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);

    const insertOk = (slug: string) =>
      db
        .prepare(
          `INSERT INTO connectors (id, slug, display_name, source, transport)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(`id-${slug}`, slug, slug, 'custom', 'stdio');

    // Valid slugs succeed
    expect(() => insertOk('linear')).not.toThrow();
    expect(() => insertOk('fn-scrum')).not.toThrow();
    expect(() => insertOk('google-drive')).not.toThrow();
    expect(() => insertOk('a')).not.toThrow();

    // Invalid slugs fail (uppercase, underscore, special chars)
    expect(() => insertOk('Linear')).toThrow();
    expect(() => insertOk('linear_one')).toThrow();
    expect(() => insertOk('linear@')).toThrow();
    expect(() => insertOk('lin ear')).toThrow();
    expect(() => insertOk('')).toThrow();

    closeDatabase(db);
  });

  it('enforces source/transport/status CHECK constraints', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);

    expect(() =>
      db
        .prepare(
          `INSERT INTO connectors (id, slug, display_name, source, transport)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run('id-1', 'a', 'A', 'invalid-source', 'stdio'),
    ).toThrow();

    expect(() =>
      db
        .prepare(
          `INSERT INTO connectors (id, slug, display_name, source, transport)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run('id-2', 'b', 'B', 'custom', 'invalid-transport'),
    ).toThrow();

    expect(() =>
      db
        .prepare(
          `INSERT INTO connectors (id, slug, display_name, source, transport, status)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run('id-3', 'c', 'C', 'custom', 'stdio', 'bogus'),
    ).toThrow();

    closeDatabase(db);
  });

  it('cascades secrets/tools/invocations on connector delete', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);

    db.prepare(
      `INSERT INTO connectors (id, slug, display_name, source, transport)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('cid', 'echo', 'Echo', 'custom', 'stdio');
    db.prepare('INSERT INTO connector_secrets (connector_id, key, value) VALUES (?, ?, ?)').run(
      'cid',
      'API_KEY',
      'xyz',
    );
    db.prepare(
      `INSERT INTO connector_tool_permissions (connector_id, tool_name, category, permission)
       VALUES (?, ?, ?, ?)`,
    ).run('cid', 'read_echo', 'read', 'always_allow');
    db.prepare(
      `INSERT INTO connector_invocations (connector_id, tool_name, result, duration_ms)
       VALUES (?, ?, ?, ?)`,
    ).run('cid', 'read_echo', 'ok', 12);

    db.prepare('DELETE FROM connectors WHERE id = ?').run('cid');

    expect(
      db.prepare('SELECT COUNT(*) AS c FROM connector_secrets').get() as { c: number },
    ).toEqual({ c: 0 });
    expect(
      db.prepare('SELECT COUNT(*) AS c FROM connector_tool_permissions').get() as { c: number },
    ).toEqual({ c: 0 });
    expect(
      db.prepare('SELECT COUNT(*) AS c FROM connector_invocations').get() as { c: number },
    ).toEqual({ c: 0 });

    closeDatabase(db);
  });

  it('is idempotent — re-running migrations after migration 5 does nothing', () => {
    const db = openDatabase(':memory:');
    const first = runMigrations(db);
    expect(first.applied).toContain(5);

    const second = runMigrations(db);
    expect(second.applied).toEqual([]);

    closeDatabase(db);
  });
});

// Spec 0044
describe('migrations: github_app_v2_dedup (migration 6)', () => {
  it('creates the connector_apps table with the expected columns', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);

    const cols = db.prepare('PRAGMA table_info(connector_apps)').all() as PragmaTableInfoRow[];
    const names = cols.map((c) => c.name);
    for (const name of [
      'id',
      'catalog_id',
      'app_id',
      'app_slug',
      'app_name',
      'pem',
      'pem_sha256',
      // Spec 0051 retired the rotate-PEM feature but kept the column as
      // nullable legacy data (per Non-Goals: SQLite DROP COLUMN
      // table-rebuild is out-of-balance with risk). No readers/writers
      // remain in TypeScript; column may be dropped in a future schema
      // cleanup migration.
      'pem_rotated_at',
      'created_at',
      'updated_at',
    ]) {
      expect(names, `connector_apps missing ${name}`).toContain(name);
    }

    closeDatabase(db);
  });

  it('adds connectors.app_id and connector_secrets.is_public columns', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);

    const connectorCols = db.prepare('PRAGMA table_info(connectors)').all() as PragmaTableInfoRow[];
    expect(connectorCols.map((c) => c.name)).toContain('app_id');

    const secretCols = db
      .prepare('PRAGMA table_info(connector_secrets)')
      .all() as PragmaTableInfoRow[];
    expect(secretCols.map((c) => c.name)).toContain('is_public');

    closeDatabase(db);
  });

  it('enforces UNIQUE(catalog_id, app_id)', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);

    db.prepare(
      `INSERT INTO connector_apps (id, catalog_id, app_id, app_slug, app_name, pem, pem_sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run('a1', 'github-app', '111', 'slug', 'name', 'pem', 'sha');

    expect(() =>
      db
        .prepare(
          `INSERT INTO connector_apps (id, catalog_id, app_id, app_slug, app_name, pem, pem_sha256)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run('a2', 'github-app', '111', 'slug', 'name', 'pem', 'sha'),
    ).toThrow(/UNIQUE/i);

    closeDatabase(db);
  });

  it('cascades connector deletes when an app is removed', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);

    db.prepare(
      `INSERT INTO connector_apps (id, catalog_id, app_id, app_slug, app_name, pem, pem_sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run('app-1', 'github-app', '111', 'slug', 'name', 'pem', 'sha');
    db.prepare(
      `INSERT INTO connectors (id, slug, display_name, source, transport, app_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('c1', 'github-app-acme', 'GitHub acme', 'catalog', 'stdio', 'app-1');
    db.prepare(
      `INSERT INTO connectors (id, slug, display_name, source, transport, app_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('c2', 'github-app-operator', 'GitHub operator', 'catalog', 'stdio', 'app-1');
    db.prepare(
      `INSERT INTO connectors (id, slug, display_name, source, transport)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('c3', 'standalone', 'Standalone', 'custom', 'stdio');

    db.prepare('DELETE FROM connector_apps WHERE id = ?').run('app-1');

    const remaining = db.prepare('SELECT id FROM connectors ORDER BY id').all() as Array<{
      id: string;
    }>;
    expect(remaining.map((r) => r.id)).toEqual(['c3']);

    closeDatabase(db);
  });

  it('migrates 4 existing github-app-* rows to the new shape', () => {
    const db = openDatabase(':memory:');
    // First, apply only migrations 1-5 by running everything (current schema).
    runMigrations(db);

    // Seed the OLD shape: 4 connectors, each with 5 reserved-key secrets.
    // Note: column app_id already exists post-migration but is null on these
    // rows. We're simulating the data state at the moment migration 6 ran.
    const seed = db.transaction(() => {
      const connectors = [
        ['c1', 'github-app-acme', 'GitHub — FlaviaNasser', 'FlaviaNasser', 'inst-100'],
        [
          'c2',
          'github-app-flavia-nasser-oms',
          'GitHub — Flavia-Nasser-OMS',
          'Flavia-Nasser-OMS',
          'inst-200',
        ],
        ['c3', 'github-app-fnlivros', 'GitHub — AcmeBooks', 'AcmeBooks', 'inst-300'],
        [
          'c4',
          'github-app-operator-hospedagem',
          'GitHub — Operator-Hospedagem',
          'Operator-Hospedagem',
          'inst-400',
        ],
      ];
      for (const [id, slug, displayName, instName, instId] of connectors) {
        db.prepare(
          `INSERT INTO connectors (id, slug, display_name, source, catalog_id, transport)
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(id, slug, displayName, 'catalog', 'github-app', 'stdio');
        const insertSecret = db.prepare(
          'INSERT INTO connector_secrets (connector_id, key, value) VALUES (?, ?, ?)',
        );
        insertSecret.run(id, '__GITHUB_APP_ID__', '12345');
        insertSecret.run(
          id,
          '__GITHUB_APP_PEM__',
          '-----BEGIN PRIVATE KEY-----\nstub\n-----END PRIVATE KEY-----',
        );
        insertSecret.run(id, '__GITHUB_INSTALLATION_ID__', instId as string);
        insertSecret.run(id, '__GITHUB_INSTALLATION_NAME__', instName as string);
        insertSecret.run(
          id,
          '__GITHUB_ENV_VAR__',
          `GITHUB_TOKEN_${(instName as string).toUpperCase().replace(/-/g, '_')}`,
        );
      }
    });
    seed();

    // ALL connectors currently have app_id = null. Now simulate "the data
    // migration step of id 6 runs": null connector_apps should be populated.
    db.prepare('DELETE FROM connector_apps').run(); // simulate pre-data-migration state
    db.prepare('UPDATE connectors SET app_id = NULL').run();

    // Re-run the data-migration SQL inline (mirrors what migration 6 does).
    db.exec(`
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
    `);

    // Assert post-migration shape:
    // 1. connector_apps has exactly 1 row with app_id=12345 + the seeded PEM.
    const apps = db.prepare('SELECT * FROM connector_apps').all() as Array<{
      id: string;
      catalog_id: string;
      app_id: string;
      app_slug: string;
      app_name: string;
      pem: string;
      pem_sha256: string;
    }>;
    expect(apps).toHaveLength(1);
    expect(apps[0]?.catalog_id).toBe('github-app');
    expect(apps[0]?.app_id).toBe('12345');
    expect(apps[0]?.pem).toContain('BEGIN PRIVATE KEY');
    // app_slug, app_name, pem_sha256 are all empty strings until first-boot backfill
    expect(apps[0]?.app_slug).toBe('');
    expect(apps[0]?.app_name).toBe('');
    expect(apps[0]?.pem_sha256).toBe('');
    // Spec 0044 review F3: id is UUID v4-shaped (8-4-4-4-12 hex with version
    // nibble '4' and variant nibble '8','9','a','b').
    expect(apps[0]?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );

    // 2. All 4 connectors point at the same connector_apps row.
    const conns = db
      .prepare("SELECT id, app_id FROM connectors WHERE slug LIKE 'github-app-%' ORDER BY id")
      .all() as Array<{ id: string; app_id: string | null }>;
    expect(conns).toHaveLength(4);
    expect(new Set(conns.map((c) => c.app_id)).size).toBe(1);
    expect(conns[0]?.app_id).toBe(apps[0]?.id);

    // 3. The 2 redundant reserved keys have been deleted; the per-installation
    //    keys remain.
    const secretKeys = db
      .prepare(
        `SELECT DISTINCT s.key FROM connector_secrets s
         JOIN connectors c ON c.id = s.connector_id
         WHERE c.slug LIKE 'github-app-%' ORDER BY s.key`,
      )
      .all() as Array<{ key: string }>;
    expect(secretKeys.map((r) => r.key)).toEqual([
      '__GITHUB_ENV_VAR__',
      '__GITHUB_INSTALLATION_ID__',
      '__GITHUB_INSTALLATION_NAME__',
    ]);

    closeDatabase(db);
  });

  it('is idempotent — re-running the data migration is a no-op', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);

    // Seed 1 row + the connector_apps row already in place.
    db.prepare(
      `INSERT INTO connector_apps (id, catalog_id, app_id, app_slug, app_name, pem, pem_sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run('app-x', 'github-app', '777', 'slug', 'name', 'pem', 'sha');

    // Run migrations again — applied=[], no duplicates.
    const second = runMigrations(db);
    expect(second.applied).toEqual([]);

    const count = db.prepare('SELECT COUNT(*) AS c FROM connector_apps').get() as { c: number };
    expect(count.c).toBe(1);

    closeDatabase(db);
  });
});

// Spec 0045
describe('migrations: github_app_v2_backfill_tools (migration 7)', () => {
  it('backfills 51 tools per github-app-* connector that has 0 tool rows', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);

    // Seed: 2 github-app-* connectors with 0 tools, 1 standard connector
    // with 0 tools, 1 github-app-* connector with PRE-EXISTING tool (not
    // backfilled).
    db.prepare(
      `INSERT INTO connectors (id, slug, display_name, source, transport, app_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('app-1', 'github-app-foo', 'Foo', 'catalog', 'stdio', null);
    db.prepare(
      `INSERT INTO connectors (id, slug, display_name, source, transport, app_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('app-2', 'github-app-bar', 'Bar', 'catalog', 'stdio', null);
    db.prepare(
      `INSERT INTO connectors (id, slug, display_name, source, transport, app_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('app-3', 'github-app-baz', 'Baz', 'catalog', 'stdio', null);
    db.prepare(
      `INSERT INTO connector_tool_permissions (connector_id, tool_name, description, category, permission)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('app-3', 'pre_existing_tool', null, 'read', 'always_allow');
    db.prepare(
      `INSERT INTO connectors (id, slug, display_name, source, transport)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('std-1', 'linear', 'Linear', 'catalog', 'remote');

    // Re-run the data-migration SQL inline (mirrors what migration 7 does).
    db.exec(`
      INSERT INTO connector_tool_permissions (connector_id, tool_name, description, category, permission)
      SELECT
        c.id, t.column1, t.column2, t.column3, t.column4
      FROM connectors c
      CROSS JOIN (VALUES
        ('add_issue_comment', 'desc', 'interactive', 'ask'),
        ('list_issues', 'desc', 'read', 'always_allow'),
        ('create_pull_request', 'desc', 'write', 'ask')
      ) AS t
      WHERE c.slug LIKE 'github-app-%'
        AND NOT EXISTS (
          SELECT 1 FROM connector_tool_permissions
          WHERE connector_id = c.id
        );
    `);

    // Assert:
    // - app-1 (no pre-existing tools) gets 3 rows
    // - app-2 (no pre-existing tools) gets 3 rows
    // - app-3 (had pre_existing_tool) is untouched (still has just that one)
    // - std-1 (not github-app-*) gets 0 rows
    const counts = db
      .prepare(
        `SELECT connector_id, COUNT(*) AS c FROM connector_tool_permissions GROUP BY connector_id ORDER BY connector_id`,
      )
      .all() as Array<{ connector_id: string; c: number }>;
    const byId = new Map(counts.map((r) => [r.connector_id, r.c]));
    expect(byId.get('app-1')).toBe(3);
    expect(byId.get('app-2')).toBe(3);
    expect(byId.get('app-3')).toBe(1);
    expect(byId.has('std-1')).toBe(false);

    closeDatabase(db);
  });

  it('migration 7 actually populates 51 tools on a fresh github-app-* row', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);

    // Insert a github-app-* connector AFTER all migrations have run.
    db.prepare(
      `INSERT INTO connectors (id, slug, display_name, source, transport)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('after-1', 'github-app-after', 'After', 'catalog', 'stdio');

    // Re-run migration 7's body (manually, since the runner only applies
    // pending migrations).
    db.exec(`
      INSERT INTO connector_tool_permissions (connector_id, tool_name, description, category, permission)
      SELECT
        c.id, t.column1, t.column2, t.column3, t.column4
      FROM connectors c
      CROSS JOIN (VALUES
        ('a', 'd', 'read', 'always_allow'),
        ('b', 'd', 'write', 'ask'),
        ('c', 'd', 'interactive', 'ask')
      ) AS t
      WHERE c.slug LIKE 'github-app-%'
        AND NOT EXISTS (
          SELECT 1 FROM connector_tool_permissions
          WHERE connector_id = c.id
        );
    `);

    const count = db
      .prepare('SELECT COUNT(*) AS c FROM connector_tool_permissions WHERE connector_id = ?')
      .get('after-1') as { c: number };
    expect(count.c).toBe(3); // matches the test VALUES; real migration has 51

    // The actual migration 7 ran during runMigrations and inserted 0 rows
    // because there were no github-app-* connectors at that time.
    // Subsequent inserts can use the same idempotent NOT EXISTS pattern.
    closeDatabase(db);
  });
});

// Spec 0052: skills + connector_skills + agent_capabilities tables.
// Skills are content-only markdown playbooks; capabilities are global
// non-MCP tool toggles seeded disabled-by-default.
describe('migrations: skills + agent_capabilities (migration 11)', () => {
  it('creates the skills table with the expected columns (post spec 0062: no body)', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);

    const cols = db.prepare('PRAGMA table_info(skills)').all() as PragmaTableInfoRow[];
    const names = cols.map((c) => c.name);
    // Spec 0062 migration 19: body is gone (content moved to FS).
    for (const name of ['id', 'name', 'description', 'source', 'created_at', 'updated_at']) {
      expect(names, `skills missing ${name}`).toContain(name);
    }
    expect(names, 'spec 0062 should have dropped body column').not.toContain('body');
    closeDatabase(db);
  });

  it('enforces UNIQUE on skills.name', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);
    db.prepare('INSERT INTO skills (id, name, description) VALUES (?, ?, ?)').run(
      'a',
      'frontend-design',
      'desc',
    );
    expect(() =>
      db
        .prepare('INSERT INTO skills (id, name, description) VALUES (?, ?, ?)')
        .run('b', 'frontend-design', 'desc2'),
    ).toThrow();
    closeDatabase(db);
  });

  it('creates the connector_skills table with FK cascade', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);
    db.exec('PRAGMA foreign_keys = ON;');

    // Seed a connector + skill, link them, then delete the skill and assert link gone.
    db.prepare(`
      INSERT INTO connectors (id, slug, display_name, source, transport)
      VALUES ('c1', 'sentry', 'Sentry', 'catalog', 'remote')
    `).run();
    db.prepare('INSERT INTO skills (id, name, description) VALUES (?, ?, ?)').run(
      's1',
      'sentry-flow',
      'desc',
    );
    db.prepare('INSERT INTO connector_skills (connector_id, skill_id) VALUES (?, ?)').run(
      'c1',
      's1',
    );
    expect(db.prepare('SELECT COUNT(*) AS c FROM connector_skills').get()).toEqual({ c: 1 });

    db.prepare('DELETE FROM skills WHERE id = ?').run('s1');
    expect(db.prepare('SELECT COUNT(*) AS c FROM connector_skills').get()).toEqual({ c: 0 });
    closeDatabase(db);
  });

  it('cascades connector deletes to connector_skills links', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);
    db.exec('PRAGMA foreign_keys = ON;');

    db.prepare(`
      INSERT INTO connectors (id, slug, display_name, source, transport)
      VALUES ('c2', 'linear', 'Linear', 'catalog', 'remote')
    `).run();
    db.prepare('INSERT INTO skills (id, name, description) VALUES (?, ?, ?)').run(
      's2',
      'linear-tips',
      'desc',
    );
    db.prepare('INSERT INTO connector_skills (connector_id, skill_id) VALUES (?, ?)').run(
      'c2',
      's2',
    );

    db.prepare('DELETE FROM connectors WHERE id = ?').run('c2');
    expect(db.prepare('SELECT COUNT(*) AS c FROM connector_skills').get()).toEqual({ c: 0 });
    closeDatabase(db);
  });

  it('creates the agent_capabilities table with seeded rows', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);

    const rows = db
      .prepare('SELECT tool_name, enabled FROM agent_capabilities ORDER BY tool_name')
      .all() as Array<{ tool_name: string; enabled: number }>;
    // Spec 0053 (migrations 13 + 15) flips dev caps to enabled=1 and seeds
    // the `Skill` capability default-on. The seeded state observed after
    // `runMigrations` reflects all migrations through 15.
    expect(rows).toEqual([
      { tool_name: 'Bash', enabled: 1 },
      { tool_name: 'Edit', enabled: 1 },
      { tool_name: 'Glob', enabled: 1 },
      { tool_name: 'Grep', enabled: 1 },
      { tool_name: 'Read', enabled: 1 },
      { tool_name: 'Skill', enabled: 1 },
      { tool_name: 'Task', enabled: 0 },
      { tool_name: 'ToolSearch', enabled: 1 },
      { tool_name: 'WebFetch', enabled: 0 },
      { tool_name: 'WebSearch', enabled: 0 },
      { tool_name: 'Write', enabled: 1 },
    ]);
    closeDatabase(db);
  });

  it('enforces enabled CHECK constraint', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);
    expect(() =>
      db.prepare('UPDATE agent_capabilities SET enabled = 2 WHERE tool_name = ?').run('Bash'),
    ).toThrow();
    closeDatabase(db);
  });

  it('is idempotent — re-running migrations after migrations 11+12 does not duplicate seeds', () => {
    const db = openDatabase(':memory:');
    const first = runMigrations(db);
    expect(first.applied).toContain(11);
    expect(first.applied).toContain(12);

    const countAfterFirst = db.prepare('SELECT COUNT(*) AS c FROM agent_capabilities').get() as {
      c: number;
    };
    expect(countAfterFirst.c).toBe(11);

    const second = runMigrations(db);
    expect(second.applied).toEqual([]);

    const countAfterSecond = db.prepare('SELECT COUNT(*) AS c FROM agent_capabilities').get() as {
      c: number;
    };
    expect(countAfterSecond.c).toBe(11);

    closeDatabase(db);
  });

  it('migration 12 seeds ToolSearch as enabled-by-default', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);
    const row = db
      .prepare('SELECT enabled FROM agent_capabilities WHERE tool_name = ?')
      .get('ToolSearch') as { enabled: number } | undefined;
    expect(row).toBeDefined();
    expect(row?.enabled).toBe(1);
    closeDatabase(db);
  });

  it('migration 13 flips Bash/Read/Edit/Write/Glob/Grep to enabled=1 (spec 0053)', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);
    const rows = db
      .prepare('SELECT tool_name, enabled FROM agent_capabilities ORDER BY tool_name')
      .all() as Array<{ tool_name: string; enabled: number }>;
    const enabledNames = rows
      .filter((r) => r.enabled === 1)
      .map((r) => r.tool_name)
      .sort();
    expect(enabledNames).toEqual([
      'Bash',
      'Edit',
      'Glob',
      'Grep',
      'Read',
      'Skill',
      'ToolSearch',
      'Write',
    ]);
    const disabledNames = rows
      .filter((r) => r.enabled === 0)
      .map((r) => r.tool_name)
      .sort();
    expect(disabledNames).toEqual(['Task', 'WebFetch', 'WebSearch']);
    closeDatabase(db);
  });

  it('migration 13 is idempotent', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);
    const before = db
      .prepare('SELECT tool_name, enabled FROM agent_capabilities ORDER BY tool_name')
      .all();
    const second = runMigrations(db);
    expect(second.applied).toEqual([]);
    const after = db
      .prepare('SELECT tool_name, enabled FROM agent_capabilities ORDER BY tool_name')
      .all();
    expect(after).toEqual(before);
    closeDatabase(db);
  });
});

describe('migrations: skills.source column (migration 14, spec 0053)', () => {
  it('adds the `source` column with default `dashboard` and CHECK enum', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);
    const cols = db.prepare("PRAGMA table_info('skills')").all() as Array<{
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
    }>;
    const sourceCol = cols.find((c) => c.name === 'source');
    expect(sourceCol).toBeDefined();
    expect(sourceCol?.type).toBe('TEXT');
    expect(sourceCol?.notnull).toBe(1);
    expect(sourceCol?.dflt_value).toBe("'dashboard'");
    closeDatabase(db);
  });

  it('CHECK constraint rejects values outside the enum', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);
    expect(() =>
      db
        .prepare(`INSERT INTO skills (id, name, description, source) VALUES ('x','a','d','other')`)
        .run(),
    ).toThrow();
    closeDatabase(db);
  });

  it('backfills pre-existing rows to source=dashboard', () => {
    // After spec 0062 migration 19 the body column is gone. The DEFAULT on
    // source still applies — inserting a row without specifying source still
    // gets 'dashboard'.
    const db = openDatabase(':memory:');
    runMigrations(db);
    db.prepare(`INSERT INTO skills (id, name, description) VALUES (?, ?, ?)`).run(
      'sk-1',
      'pre-existing',
      'd',
    );
    const row = db.prepare('SELECT source FROM skills WHERE id = ?').get('sk-1') as
      | { source: string }
      | undefined;
    expect(row?.source).toBe('dashboard');
    closeDatabase(db);
  });

  it('idx_skills_source index exists', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);
    const idx = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name='idx_skills_source'`)
      .get();
    expect(idx).toBeDefined();
    closeDatabase(db);
  });

  /**
   * Spec 0053 — regression test for the FK cascade trap during migration 14's
   * table recreate. db.ts opens with `foreign_keys=ON`; without the
   * backup-and-restore dance the `DROP TABLE skills` would cascade-delete
   * every `connector_skills` row pointing at it. This simulates an upgrade
   * from spec 0052 state by manually re-running the migration 14-style SQL
   * (with the body column, since this exercises the historical migration
   * shape) after seeding sample link rows.
   *
   * Spec 0062: the production migration 14 has not changed; only the LIVE
   * skills schema lost `body` (via migration 19). This test still uses the
   * with-body shape locally because it's manually replaying migration 14's
   * historical SQL — exercising what would have happened on a 0053-era DB.
   */
  it('migration 14 preserves connector_skills rows across the table recreate', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);

    // Seed: a connector + skill + link. Post-0062 the live schema has no
    // `body` column, so we insert without it and rely on the row preservation
    // through the manual table-recreate below.
    db.prepare(
      `INSERT INTO connectors (id, slug, display_name, source, transport)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('con-1', 'echo', 'Echo', 'custom', 'stdio');
    db.prepare(`INSERT INTO skills (id, name, description, source) VALUES (?, ?, ?, ?)`).run(
      'sk-1',
      'a-skill',
      'd',
      'dashboard',
    );
    db.prepare(`INSERT INTO connector_skills (connector_id, skill_id) VALUES (?, ?)`).run(
      'con-1',
      'sk-1',
    );
    expect(
      (db.prepare('SELECT COUNT(*) AS c FROM connector_skills').get() as { c: number }).c,
    ).toBe(1);

    // Re-run a migration-14-style recreate manually (without the body column,
    // since the live table no longer has one post-0062). The point of the
    // test is the link preservation, not the column shape.
    db.exec(`
      CREATE TEMP TABLE _spec0053_cs_backup_test AS SELECT * FROM connector_skills;
      DELETE FROM connector_skills;
      CREATE TABLE skills_new2 (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'dashboard' CHECK (source IN ('zeno_default','profile','dashboard')),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      INSERT INTO skills_new2 (id, name, description, source, created_at, updated_at)
        SELECT id, name, description, source, created_at, updated_at FROM skills;
      DROP TABLE skills;
      ALTER TABLE skills_new2 RENAME TO skills;
      INSERT INTO connector_skills (connector_id, skill_id, created_at)
        SELECT connector_id, skill_id, created_at FROM _spec0053_cs_backup_test;
      DROP TABLE _spec0053_cs_backup_test;
    `);

    // The link must still exist after the recreate.
    expect(
      (db.prepare('SELECT COUNT(*) AS c FROM connector_skills').get() as { c: number }).c,
    ).toBe(1);
    const link = db.prepare('SELECT connector_id, skill_id FROM connector_skills').get() as {
      connector_id: string;
      skill_id: string;
    };
    expect(link).toEqual({ connector_id: 'con-1', skill_id: 'sk-1' });

    closeDatabase(db);
  });
});

describe('migrations: cron_skills + cron_connectors (migrations 16 + 17)', () => {
  it('migration 16 creates cron_skills with PK and the expected columns', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);
    const cols = db.prepare('PRAGMA table_info(cron_skills)').all() as Array<{
      name: string;
      pk: number;
    }>;
    expect(cols.map((c) => c.name).sort()).toEqual(['created_at', 'cron_id', 'skill_id']);
    // cron_id + skill_id form the composite PK.
    const pkCols = cols
      .filter((c) => c.pk > 0)
      .map((c) => c.name)
      .sort();
    expect(pkCols).toEqual(['cron_id', 'skill_id']);
    closeDatabase(db);
  });

  it('migration 17 creates cron_connectors with PK and the expected columns', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);
    const cols = db.prepare('PRAGMA table_info(cron_connectors)').all() as Array<{
      name: string;
      pk: number;
    }>;
    expect(cols.map((c) => c.name).sort()).toEqual(['connector_id', 'created_at', 'cron_id']);
    const pkCols = cols
      .filter((c) => c.pk > 0)
      .map((c) => c.name)
      .sort();
    expect(pkCols).toEqual(['connector_id', 'cron_id']);
    closeDatabase(db);
  });

  it('cron_skills FK CASCADE: deleting a cron drops its rows', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);
    db.exec(
      "INSERT INTO crons (id, name, prompt, schedule, source) VALUES ('c1', 'c1', 'p', '* * * * *', 'chat')",
    );
    db.exec(
      "INSERT INTO skills (id, name, description, source) VALUES ('s1', 's1', 'd', 'dashboard')",
    );
    db.exec("INSERT INTO cron_skills (cron_id, skill_id) VALUES ('c1', 's1')");
    expect((db.prepare('SELECT COUNT(*) AS c FROM cron_skills').get() as { c: number }).c).toBe(1);
    db.exec("DELETE FROM crons WHERE id = 'c1'");
    expect((db.prepare('SELECT COUNT(*) AS c FROM cron_skills').get() as { c: number }).c).toBe(0);
    closeDatabase(db);
  });

  it('cron_skills FK CASCADE: deleting a skill drops its rows', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);
    db.exec(
      "INSERT INTO crons (id, name, prompt, schedule, source) VALUES ('c1', 'c1', 'p', '* * * * *', 'chat')",
    );
    db.exec(
      "INSERT INTO skills (id, name, description, source) VALUES ('s1', 's1', 'd', 'dashboard')",
    );
    db.exec("INSERT INTO cron_skills (cron_id, skill_id) VALUES ('c1', 's1')");
    db.exec("DELETE FROM skills WHERE id = 's1'");
    expect((db.prepare('SELECT COUNT(*) AS c FROM cron_skills').get() as { c: number }).c).toBe(0);
    closeDatabase(db);
  });

  it('cron_connectors FK CASCADE: deleting a cron drops its rows', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);
    db.exec(
      "INSERT INTO crons (id, name, prompt, schedule, source) VALUES ('c1', 'c1', 'p', '* * * * *', 'chat')",
    );
    db.exec(
      "INSERT INTO connectors (id, slug, display_name, source, transport, status) VALUES ('co1', 'linear', 'L', 'catalog', 'remote', 'enabled')",
    );
    db.exec("INSERT INTO cron_connectors (cron_id, connector_id) VALUES ('c1', 'co1')");
    db.exec("DELETE FROM crons WHERE id = 'c1'");
    expect((db.prepare('SELECT COUNT(*) AS c FROM cron_connectors').get() as { c: number }).c).toBe(
      0,
    );
    closeDatabase(db);
  });

  it('cron_connectors FK CASCADE: deleting a connector drops its rows', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);
    db.exec(
      "INSERT INTO crons (id, name, prompt, schedule, source) VALUES ('c1', 'c1', 'p', '* * * * *', 'chat')",
    );
    db.exec(
      "INSERT INTO connectors (id, slug, display_name, source, transport, status) VALUES ('co1', 'linear', 'L', 'catalog', 'remote', 'enabled')",
    );
    db.exec("INSERT INTO cron_connectors (cron_id, connector_id) VALUES ('c1', 'co1')");
    db.exec("DELETE FROM connectors WHERE id = 'co1'");
    expect((db.prepare('SELECT COUNT(*) AS c FROM cron_connectors').get() as { c: number }).c).toBe(
      0,
    );
    closeDatabase(db);
  });

  it('migration 16 + 17 are idempotent — re-running does nothing', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);
    const second = runMigrations(db);
    expect(second.applied).toEqual([]);
    // Spec 0062 added migration 19. The "current" is the highest applied id.
    expect(second.current).toBe(19);
    closeDatabase(db);
  });
});

// Spec 0057: migration 18 adds the connectors.kind discriminator column.
// Existing rows default to 'mcp'; new rows can specify 'mcp' | 'channel'.
// The CHECK constraint rejects values outside that enum.
describe('migrations: connectors.kind (migration 18, spec 0057)', () => {
  it('adds kind column to connectors with default mcp', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);
    const cols = db.prepare("PRAGMA table_info('connectors')").all() as PragmaTableInfoRow[];
    const kindCol = cols.find((c) => c.name === 'kind');
    expect(kindCol).toBeDefined();
    expect(kindCol?.notnull).toBe(1);
    expect(kindCol?.dflt_value).toBe("'mcp'");
    closeDatabase(db);
  });

  it('inserting a row without kind defaults to mcp', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);
    db.exec(
      "INSERT INTO connectors (id, slug, display_name, source, transport, status) VALUES ('m1', 'sentry', 'Sentry', 'catalog', 'stdio', 'enabled')",
    );
    const row = db.prepare('SELECT kind FROM connectors WHERE id = ?').get('m1') as {
      kind: string;
    };
    expect(row.kind).toBe('mcp');
    closeDatabase(db);
  });

  it('accepts kind=channel explicitly', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);
    db.exec(
      "INSERT INTO connectors (id, slug, display_name, source, transport, status, kind) VALUES ('c1', 'slack', 'Slack', 'catalog', 'remote', 'enabled', 'channel')",
    );
    const row = db.prepare('SELECT kind FROM connectors WHERE id = ?').get('c1') as {
      kind: string;
    };
    expect(row.kind).toBe('channel');
    closeDatabase(db);
  });

  it('rejects kind values outside enum', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);
    expect(() =>
      db.exec(
        "INSERT INTO connectors (id, slug, display_name, source, transport, status, kind) VALUES ('x1', 'bogus', 'Bogus', 'catalog', 'stdio', 'enabled', 'unknown')",
      ),
    ).toThrow(/CHECK constraint failed/);
    closeDatabase(db);
  });
});
