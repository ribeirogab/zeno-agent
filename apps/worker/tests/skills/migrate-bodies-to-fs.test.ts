/**
 * Spec 0062 — preMigrateBodiesToFs unit tests. Verify the four
 * scenarios from the spec:
 * 1. Idempotency: if `body` column is absent, the script is a silent no-op.
 * 2. Dashboard rows: body is written to /workspace/skills/<name>/SKILL.md.
 * 3. Profile rows: if FS body matches DB body, no-op. If DIVERGED, write
 *    DB body to /workspace/skills/ AND flip source to 'dashboard'.
 * 4. zeno_default rows: if diverged, trust FS (no-op + WARN).
 *
 * The script runs BEFORE the body-drop migration, so we set up a DB with
 * the legacy body column and run the script directly. Then we re-run the
 * script to assert idempotency.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openRuntimeDatabase } from '@zeno/db/runtime';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { preMigrateBodiesToFs } from '@/skills/migrate-bodies-to-fs';

/**
 * Build a raw SQLite handle with the LEGACY (pre-spec-0062) skills schema —
 * body column present. We can't use `runRuntimeMigrations` because that
 * applies migration 19 which drops body. So we build the schema manually up
 * to migration 18's shape.
 */
function buildLegacyDb(): { raw: Database.Database; close: () => void } {
  const opened = openRuntimeDatabase(':memory:');
  opened.raw.exec(`
    CREATE TABLE migrations (id INTEGER PRIMARY KEY);
    CREATE TABLE skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      body TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'dashboard' CHECK (source IN ('zeno_default','profile','dashboard')),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX idx_skills_name ON skills(name);
    CREATE INDEX idx_skills_source ON skills(source);
  `);
  return { raw: opened.raw, close: opened.close };
}

function seedSkillFile(root: string, name: string, description: string, body: string): void {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}`,
    'utf8',
  );
}

describe('preMigrateBodiesToFs (spec 0062)', () => {
  let tmp: string;
  let agentSkillsRoot: string;
  let profileSkillsRoot: string;
  let dashboardSkillsRoot: string;
  let db: Database.Database;
  let close: () => void;
  // biome-ignore lint/suspicious/noExplicitAny: vitest mock
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  } as any;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'zeno-pre-migrate-'));
    agentSkillsRoot = join(tmp, 'agent', 'skills');
    profileSkillsRoot = join(tmp, 'profile', 'skills');
    dashboardSkillsRoot = join(tmp, 'workspace', 'skills');
    mkdirSync(agentSkillsRoot, { recursive: true });
    mkdirSync(profileSkillsRoot, { recursive: true });
    mkdirSync(dashboardSkillsRoot, { recursive: true });
    const built = buildLegacyDb();
    db = built.raw;
    close = built.close;
    logger.info.mockClear();
    logger.warn.mockClear();
  });

  afterEach(() => {
    close();
    rmSync(tmp, { recursive: true, force: true });
  });

  it('is a no-op when the body column is already gone (idempotency)', () => {
    close();
    const opened = openRuntimeDatabase(':memory:');
    db = opened.raw;
    close = opened.close;
    db.exec(`
      CREATE TABLE skills (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'dashboard'
      );
    `);
    const report = preMigrateBodiesToFs({
      db,
      agentSkillsRoot,
      profileSkillsRoot,
      dashboardSkillsRoot,
      logger,
    });
    expect(report.alreadyMigrated).toBe(true);
    expect(report.dashboardWritten).toBe(0);
  });

  it('writes dashboard bodies to /workspace/skills/<name>/SKILL.md', () => {
    db.prepare(
      `INSERT INTO skills (id, name, description, body, source) VALUES (?, ?, ?, ?, ?)`,
    ).run('sk-1', 'skill-creator', 'Builder for new skills', '# body content', 'dashboard');

    const report = preMigrateBodiesToFs({
      db,
      agentSkillsRoot,
      profileSkillsRoot,
      dashboardSkillsRoot,
      logger,
    });

    expect(report.alreadyMigrated).toBe(false);
    expect(report.dashboardWritten).toBe(1);

    const content = readFileSync(join(dashboardSkillsRoot, 'skill-creator', 'SKILL.md'), 'utf8');
    expect(content).toContain('name: skill-creator');
    expect(content).toContain('description: Builder for new skills');
    expect(content).toContain('# body content');
  });

  it('is idempotent — running twice produces the same FS state', () => {
    db.prepare(
      `INSERT INTO skills (id, name, description, body, source) VALUES (?, ?, ?, ?, ?)`,
    ).run('sk-1', 'skill-creator', 'Builder for new skills', '# body content', 'dashboard');

    const r1 = preMigrateBodiesToFs({
      db,
      agentSkillsRoot,
      profileSkillsRoot,
      dashboardSkillsRoot,
      logger,
    });
    expect(r1.dashboardWritten).toBe(1);

    // Second run — column still exists, so it'll re-write. Idempotent
    // because the file content is identical.
    const r2 = preMigrateBodiesToFs({
      db,
      agentSkillsRoot,
      profileSkillsRoot,
      dashboardSkillsRoot,
      logger,
    });
    expect(r2.dashboardWritten).toBe(1);

    const content = readFileSync(join(dashboardSkillsRoot, 'skill-creator', 'SKILL.md'), 'utf8');
    expect(content).toContain('# body content');
  });

  it('profile row matching FS body: no-op (no flip, no write to dashboard)', () => {
    seedSkillFile(profileSkillsRoot, 'widget-code-review', 'd', 'matching body');
    db.prepare(
      `INSERT INTO skills (id, name, description, body, source) VALUES (?, ?, ?, ?, ?)`,
    ).run('sk-2', 'widget-code-review', 'd', '\nmatching body', 'profile');

    const report = preMigrateBodiesToFs({
      db,
      agentSkillsRoot,
      profileSkillsRoot,
      dashboardSkillsRoot,
      logger,
    });

    expect(report.profileFlipped).toEqual([]);
    // Source should still be profile (not flipped).
    const row = db.prepare('SELECT source FROM skills WHERE id = ?').get('sk-2') as {
      source: string;
    };
    expect(row.source).toBe('profile');
    // No dashboard FS dir created.
    expect(existsSync(join(dashboardSkillsRoot, 'widget-code-review'))).toBe(false);
  });

  it('profile row diverged from FS: flip to dashboard + write body to /workspace/skills/', () => {
    seedSkillFile(profileSkillsRoot, 'widget-code-review', 'd', 'original body');
    // DB body diverges (operator edited via dashboard PATCH).
    db.prepare(
      `INSERT INTO skills (id, name, description, body, source) VALUES (?, ?, ?, ?, ?)`,
    ).run('sk-2', 'widget-code-review', 'd', '\nedited body', 'profile');

    const report = preMigrateBodiesToFs({
      db,
      agentSkillsRoot,
      profileSkillsRoot,
      dashboardSkillsRoot,
      logger,
    });

    expect(report.profileFlipped).toEqual(['widget-code-review']);
    // Source flipped.
    const row = db.prepare('SELECT source FROM skills WHERE id = ?').get('sk-2') as {
      source: string;
    };
    expect(row.source).toBe('dashboard');
    // Body now lives at /workspace/skills/.
    const content = readFileSync(
      join(dashboardSkillsRoot, 'widget-code-review', 'SKILL.md'),
      'utf8',
    );
    expect(content).toContain('edited body');
  });

  it('zeno_default row matching FS body: no-op (no warn)', () => {
    seedSkillFile(agentSkillsRoot, 'zeno-development', 'd', 'matching body');
    db.prepare(
      `INSERT INTO skills (id, name, description, body, source) VALUES (?, ?, ?, ?, ?)`,
    ).run('sk-3', 'zeno-development', 'd', '\nmatching body', 'zeno_default');

    const report = preMigrateBodiesToFs({
      db,
      agentSkillsRoot,
      profileSkillsRoot,
      dashboardSkillsRoot,
      logger,
    });

    expect(report.zenoDefaultDiverged).toEqual([]);
    // Source unchanged.
    const row = db.prepare('SELECT source FROM skills WHERE id = ?').get('sk-3') as {
      source: string;
    };
    expect(row.source).toBe('zeno_default');
  });

  it('zeno_default row diverged from FS: WARN, no flip, no write (FS wins)', () => {
    seedSkillFile(agentSkillsRoot, 'zeno-development', 'd', 'fs body');
    db.prepare(
      `INSERT INTO skills (id, name, description, body, source) VALUES (?, ?, ?, ?, ?)`,
    ).run('sk-3', 'zeno-development', 'd', '\ndb body different', 'zeno_default');

    const report = preMigrateBodiesToFs({
      db,
      agentSkillsRoot,
      profileSkillsRoot,
      dashboardSkillsRoot,
      logger,
    });

    expect(report.zenoDefaultDiverged).toEqual(['zeno-development']);
    // Source unchanged.
    const row = db.prepare('SELECT source FROM skills WHERE id = ?').get('sk-3') as {
      source: string;
    };
    expect(row.source).toBe('zeno_default');
    // No dashboard FS write.
    expect(existsSync(join(dashboardSkillsRoot, 'zeno-development'))).toBe(false);
    // Warning emitted.
    const warnCall = logger.warn.mock.calls.find(
      // biome-ignore lint/suspicious/noExplicitAny: vitest mock
      (c: any[]) => c[0]?.event === 'skills_pre_migrate_zeno_default_diverged',
    );
    expect(warnCall).toBeDefined();
  });

  it('handles all three sources in a single run', () => {
    // Dashboard
    db.prepare(
      `INSERT INTO skills (id, name, description, body, source) VALUES (?, ?, ?, ?, ?)`,
    ).run('sk-d', 'd-skill', 'd', 'd body', 'dashboard');
    // Profile (matching FS)
    seedSkillFile(profileSkillsRoot, 'p-skill', 'd', 'p body');
    db.prepare(
      `INSERT INTO skills (id, name, description, body, source) VALUES (?, ?, ?, ?, ?)`,
    ).run('sk-p', 'p-skill', 'd', '\np body', 'profile');
    // zeno_default (matching FS)
    seedSkillFile(agentSkillsRoot, 'z-skill', 'd', 'z body');
    db.prepare(
      `INSERT INTO skills (id, name, description, body, source) VALUES (?, ?, ?, ?, ?)`,
    ).run('sk-z', 'z-skill', 'd', '\nz body', 'zeno_default');

    const report = preMigrateBodiesToFs({
      db,
      agentSkillsRoot,
      profileSkillsRoot,
      dashboardSkillsRoot,
      logger,
    });

    expect(report).toMatchObject({
      alreadyMigrated: false,
      dashboardWritten: 1,
      profileFlipped: [],
      profileSkippedNameCollision: [],
      zenoDefaultDiverged: [],
    });
  });
});
