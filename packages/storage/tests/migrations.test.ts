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

interface IndexListRow {
  seq: number;
  name: string;
  unique: number;
  origin: string;
  partial: number;
}

describe('migrations: approvals_log (migration 4)', () => {
  it('creates the approvals_log table with the expected columns', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);

    const columns = db.prepare('PRAGMA table_info(approvals_log)').all() as PragmaTableInfoRow[];
    const byName = new Map(columns.map((column) => [column.name, column]));

    const expectedColumns = [
      'id',
      'profile',
      'correlation_id',
      'thread_id',
      'requester_user_id',
      'decider_user_id',
      'tool_name',
      'tool_input',
      'policy_that_gated',
      'classifier_reason',
      'decision',
      'decision_reason',
      'created_at',
    ];
    for (const name of expectedColumns) {
      expect(byName.has(name), `missing column ${name}`).toBe(true);
    }

    // NOT NULL constraints on the required fields
    const required = [
      'profile',
      'correlation_id',
      'requester_user_id',
      'tool_name',
      'tool_input',
      'policy_that_gated',
      'decision',
      'decision_reason',
      'created_at',
    ];
    for (const name of required) {
      expect(byName.get(name)?.notnull, `${name} should be NOT NULL`).toBe(1);
    }

    // Nullable columns
    const nullable = ['thread_id', 'decider_user_id', 'classifier_reason'];
    for (const name of nullable) {
      expect(byName.get(name)?.notnull, `${name} should be nullable`).toBe(0);
    }

    expect(byName.get('id')?.pk).toBe(1);

    closeDatabase(db);
  });

  it('creates the approvals_log indexes', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);

    const indexes = db.prepare('PRAGMA index_list(approvals_log)').all() as IndexListRow[];
    const indexNames = indexes.map((index) => index.name);
    expect(indexNames).toContain('idx_approvals_log_profile_created');
    expect(indexNames).toContain('idx_approvals_log_correlation');

    closeDatabase(db);
  });

  it('enforces the decision CHECK constraint', () => {
    const db = openDatabase(':memory:');
    runMigrations(db);

    expect(() =>
      db
        .prepare(
          `INSERT INTO approvals_log
            (profile, correlation_id, requester_user_id, tool_name, tool_input,
             policy_that_gated, decision, decision_reason)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run('default', 'corr-1', 'U1', 'Bash', '{}', 'classifier', 'maybe', 'reason'),
    ).toThrow();

    closeDatabase(db);
  });

  it('is idempotent — re-running migrations after migration 4 does nothing', () => {
    const db = openDatabase(':memory:');
    const first = runMigrations(db);
    expect(first.applied).toContain(4);

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
