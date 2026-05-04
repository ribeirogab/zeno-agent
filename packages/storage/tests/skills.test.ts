import { beforeEach, describe, expect, it } from 'vitest';
import { type DB, openDatabase } from '../src/db';
import { runMigrations } from '../src/migrations';
import { SkillRepo } from '../src/repos/skills';

let db: DB;
let repo: SkillRepo;

const TEST_ROOTS = {
  agentSkillsRoot: '/test/agent/skills',
  profileSkillsRoot: '/test/profile/skills',
  dashboardSkillsRoot: '/test/workspace/skills',
};

beforeEach(() => {
  db = openDatabase(':memory:');
  runMigrations(db);
  repo = new SkillRepo(db, TEST_ROOTS);
});

describe('SkillRepo', () => {
  it('create + get round-trips a skill', () => {
    const created = repo.create({
      name: 'frontend-design',
      description: 'Padrão de UX e revisão de código React/Tailwind.',
    });
    const fetched = repo.get(created.id);
    expect(fetched).toMatchObject({
      id: created.id,
      name: 'frontend-design',
      description: 'Padrão de UX e revisão de código React/Tailwind.',
    });
    expect(fetched?.createdAt).toBeTruthy();
    expect(fetched?.updatedAt).toBeTruthy();
    // Spec 0062: body field is gone from the type entirely.
    expect(Object.keys(fetched ?? {})).not.toContain('body');
  });

  it('list returns skills ordered by name', () => {
    repo.create({ name: 'sentry-flow', description: 'd' });
    repo.create({ name: 'aws-debug', description: 'd' });
    repo.create({ name: 'frontend-design', description: 'd' });

    const names = repo.list().map((s) => s.name);
    expect(names).toEqual(['aws-debug', 'frontend-design', 'sentry-flow']);
  });

  it('getByName retrieves by frontmatter name', () => {
    repo.create({ name: 'aws-debug', description: 'd' });
    const found = repo.getByName('aws-debug');
    expect(found?.name).toBe('aws-debug');
    expect(repo.getByName('nonexistent')).toBeNull();
  });

  it('throws on duplicate name (UNIQUE constraint)', () => {
    repo.create({ name: 'frontend-design', description: 'd' });
    expect(() => repo.create({ name: 'frontend-design', description: 'd2' })).toThrow();
  });

  it('update description bumps updated_at', async () => {
    const created = repo.create({ name: 'aws-debug', description: 'old desc' });
    // Wait 5ms so updated_at differs at the fractional-second level.
    await new Promise((r) => setTimeout(r, 5));
    const updated = repo.update(created.id, { description: 'new desc' });
    expect(updated?.description).toBe('new desc');
    expect(updated?.name).toBe('aws-debug'); // immutable
    expect(updated?.updatedAt).not.toBe(created.updatedAt);
  });

  it('update with empty patch returns current row unchanged', () => {
    const created = repo.create({ name: 'a', description: 'd' });
    const updated = repo.update(created.id, {});
    expect(updated).toMatchObject({ id: created.id, name: 'a', description: 'd' });
  });

  it('update returns null for missing id', () => {
    expect(repo.update('nonexistent', { description: 'x' })).toBeNull();
  });

  it('delete returns true on success, false on missing', () => {
    const created = repo.create({ name: 'a', description: 'd' });
    expect(repo.delete(created.id)).toBe(true);
    expect(repo.get(created.id)).toBeNull();
    expect(repo.delete(created.id)).toBe(false);
  });

  // Spec 0053 — source column tests
  it('create defaults source to dashboard (spec 0053)', () => {
    const skill = repo.create({ name: 'a-skill', description: 'd' });
    expect(skill.source).toBe('dashboard');
  });

  it('create accepts an explicit source (spec 0053)', () => {
    const profile = repo.create({
      name: 'p-skill',
      description: 'd',
      source: 'profile',
    });
    expect(profile.source).toBe('profile');
    const def = repo.create({
      name: 'z-skill',
      description: 'd',
      source: 'zeno_default',
    });
    expect(def.source).toBe('zeno_default');
  });

  it('upsertBySource inserts then updates the same row (spec 0053)', () => {
    const first = repo.upsertBySource({
      name: 'x',
      description: 'd1',
      source: 'zeno_default',
    });
    const second = repo.upsertBySource({
      name: 'x',
      description: 'd2',
      source: 'zeno_default',
    });
    expect(first.id).toBe(second.id);
    expect(second.description).toBe('d2');
  });

  it('deleteOrphans removes zeno_default rows whose name not in allowlist (spec 0053)', () => {
    repo.upsertBySource({ name: 'a', description: 'd', source: 'zeno_default' });
    repo.upsertBySource({ name: 'b', description: 'd', source: 'zeno_default' });
    repo.create({ name: 'c-dash', description: 'd' }); // dashboard, must NOT be deleted
    const result = repo.deleteOrphans('zeno_default', ['a']);
    expect(result.removed).toEqual(['b']);
    expect(
      repo
        .list()
        .map((s) => s.name)
        .sort(),
    ).toEqual(['a', 'c-dash']);
  });

  it('deleteOrphans keeps zeno_default rows when allowlist is empty AND no rows exist of that source', () => {
    // Verifies the zero-row branch.
    repo.create({ name: 'd-only', description: 'd' });
    const result = repo.deleteOrphans('zeno_default', []);
    expect(result.removed).toEqual([]);
    expect(repo.list()).toHaveLength(1);
  });

  it('deleteOrphans deletes EVERY zeno_default row when allowlist is empty (file tree empty)', () => {
    repo.upsertBySource({ name: 'old-1', description: 'd', source: 'zeno_default' });
    repo.upsertBySource({ name: 'old-2', description: 'd', source: 'zeno_default' });
    const result = repo.deleteOrphans('zeno_default', []);
    expect(result.removed.sort()).toEqual(['old-1', 'old-2']);
    expect(repo.list()).toHaveLength(0);
  });

  it('deleteOrphans is a no-op for source=profile (profile orphans are kept)', () => {
    repo.upsertBySource({ name: 'p1', description: 'd', source: 'profile' });
    const result = repo.deleteOrphans('profile', []);
    expect(result.removed).toEqual([]);
    expect(repo.list()).toHaveLength(1);
  });

  it('deleteOrphans is a no-op for source=dashboard', () => {
    repo.create({ name: 'd1', description: 'd' });
    const result = repo.deleteOrphans('dashboard', []);
    expect(result.removed).toEqual([]);
    expect(repo.list()).toHaveLength(1);
  });

  // Spec 0062 — canonicalPath
  describe('canonicalPath (spec 0062)', () => {
    it('returns agentSkillsRoot/<name> for zeno_default source', () => {
      const skill = repo.upsertBySource({
        name: 'zeno-development',
        description: 'd',
        source: 'zeno_default',
      });
      expect(repo.canonicalPath(skill)).toBe('/test/agent/skills/zeno-development');
    });

    it('returns profileSkillsRoot/<name> for profile source', () => {
      const skill = repo.upsertBySource({
        name: 'widget-code-review',
        description: 'd',
        source: 'profile',
      });
      expect(repo.canonicalPath(skill)).toBe('/test/profile/skills/widget-code-review');
    });

    it('returns dashboardSkillsRoot/<name> for dashboard source', () => {
      const skill = repo.create({ name: 'skill-creator', description: 'd' });
      expect(repo.canonicalPath(skill)).toBe('/test/workspace/skills/skill-creator');
    });
  });

  // Spec 0062 — body column gone
  it('skills table no longer has a body column (spec 0062 migration 19)', () => {
    const cols = (db.prepare('PRAGMA table_info(skills)').all() as Array<{ name: string }>).map(
      (c) => c.name,
    );
    expect(cols).not.toContain('body');
    expect(cols).toContain('id');
    expect(cols).toContain('name');
    expect(cols).toContain('description');
    expect(cols).toContain('source');
  });
});
