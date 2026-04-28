import { beforeEach, describe, expect, it } from 'vitest';
import { type DB, openDatabase } from '../src/db';
import { runMigrations } from '../src/migrations';
import { SkillRepo } from '../src/repos/skills';

let db: DB;
let repo: SkillRepo;

beforeEach(() => {
  db = openDatabase(':memory:');
  runMigrations(db);
  repo = new SkillRepo(db);
});

describe('SkillRepo', () => {
  it('create + get round-trips a skill', () => {
    const created = repo.create({
      name: 'frontend-design',
      description: 'Padrão de UX e revisão de código React/Tailwind.',
      body: '# Frontend design review\n\nAntes de aprovar PR de frontend...',
    });
    const fetched = repo.get(created.id);
    expect(fetched).toMatchObject({
      id: created.id,
      name: 'frontend-design',
      description: 'Padrão de UX e revisão de código React/Tailwind.',
      body: '# Frontend design review\n\nAntes de aprovar PR de frontend...',
    });
    expect(fetched?.createdAt).toBeTruthy();
    expect(fetched?.updatedAt).toBeTruthy();
  });

  it('list returns skills ordered by name', () => {
    repo.create({ name: 'sentry-flow', description: 'd', body: 'b' });
    repo.create({ name: 'aws-debug', description: 'd', body: 'b' });
    repo.create({ name: 'frontend-design', description: 'd', body: 'b' });

    const names = repo.list().map((s) => s.name);
    expect(names).toEqual(['aws-debug', 'frontend-design', 'sentry-flow']);
  });

  it('getByName retrieves by frontmatter name', () => {
    repo.create({ name: 'aws-debug', description: 'd', body: 'b' });
    const found = repo.getByName('aws-debug');
    expect(found?.name).toBe('aws-debug');
    expect(repo.getByName('nonexistent')).toBeNull();
  });

  it('throws on duplicate name (UNIQUE constraint)', () => {
    repo.create({ name: 'frontend-design', description: 'd', body: 'b' });
    expect(() => repo.create({ name: 'frontend-design', description: 'd2', body: 'b2' })).toThrow();
  });

  it('update body and description; bumps updated_at', async () => {
    const created = repo.create({
      name: 'aws-debug',
      description: 'old desc',
      body: 'old body',
    });
    // Wait 5ms so updated_at differs at the fractional-second level.
    await new Promise((r) => setTimeout(r, 5));
    const updated = repo.update(created.id, {
      description: 'new desc',
      body: 'new body',
    });
    expect(updated?.description).toBe('new desc');
    expect(updated?.body).toBe('new body');
    expect(updated?.name).toBe('aws-debug'); // immutable
    expect(updated?.updatedAt).not.toBe(created.updatedAt);
  });

  it('update with empty patch returns current row unchanged', () => {
    const created = repo.create({ name: 'a', description: 'd', body: 'b' });
    const updated = repo.update(created.id, {});
    expect(updated).toMatchObject({ id: created.id, name: 'a', description: 'd', body: 'b' });
  });

  it('update returns null for missing id', () => {
    expect(repo.update('nonexistent', { description: 'x' })).toBeNull();
  });

  it('delete returns true on success, false on missing', () => {
    const created = repo.create({ name: 'a', description: 'd', body: 'b' });
    expect(repo.delete(created.id)).toBe(true);
    expect(repo.get(created.id)).toBeNull();
    expect(repo.delete(created.id)).toBe(false);
  });

  // Spec 0053 — source column tests
  it('create defaults source to dashboard (spec 0053)', () => {
    const skill = repo.create({ name: 'a-skill', description: 'd', body: 'b' });
    expect(skill.source).toBe('dashboard');
  });

  it('create accepts an explicit source (spec 0053)', () => {
    const profile = repo.create({
      name: 'p-skill',
      description: 'd',
      body: 'b',
      source: 'profile',
    });
    expect(profile.source).toBe('profile');
    const def = repo.create({
      name: 'z-skill',
      description: 'd',
      body: 'b',
      source: 'zeno_default',
    });
    expect(def.source).toBe('zeno_default');
  });

  it('upsertBySource inserts then updates the same row (spec 0053)', () => {
    const first = repo.upsertBySource({
      name: 'x',
      description: 'd1',
      body: 'b1',
      source: 'zeno_default',
    });
    const second = repo.upsertBySource({
      name: 'x',
      description: 'd2',
      body: 'b2',
      source: 'zeno_default',
    });
    expect(first.id).toBe(second.id);
    expect(second.description).toBe('d2');
    expect(second.body).toBe('b2');
  });

  it('deleteOrphans removes zeno_default rows whose name not in allowlist (spec 0053)', () => {
    repo.upsertBySource({ name: 'a', description: 'd', body: 'b', source: 'zeno_default' });
    repo.upsertBySource({ name: 'b', description: 'd', body: 'b', source: 'zeno_default' });
    repo.create({ name: 'c-dash', description: 'd', body: 'b' }); // dashboard, must NOT be deleted
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
    repo.create({ name: 'd-only', description: 'd', body: 'b' });
    const result = repo.deleteOrphans('zeno_default', []);
    expect(result.removed).toEqual([]);
    expect(repo.list()).toHaveLength(1);
  });

  it('deleteOrphans deletes EVERY zeno_default row when allowlist is empty (file tree empty)', () => {
    repo.upsertBySource({ name: 'old-1', description: 'd', body: 'b', source: 'zeno_default' });
    repo.upsertBySource({ name: 'old-2', description: 'd', body: 'b', source: 'zeno_default' });
    const result = repo.deleteOrphans('zeno_default', []);
    expect(result.removed.sort()).toEqual(['old-1', 'old-2']);
    expect(repo.list()).toHaveLength(0);
  });

  it('deleteOrphans is a no-op for source=profile (profile orphans are kept)', () => {
    repo.upsertBySource({ name: 'p1', description: 'd', body: 'b', source: 'profile' });
    const result = repo.deleteOrphans('profile', []);
    expect(result.removed).toEqual([]);
    expect(repo.list()).toHaveLength(1);
  });

  it('deleteOrphans is a no-op for source=dashboard', () => {
    repo.create({ name: 'd1', description: 'd', body: 'b' });
    const result = repo.deleteOrphans('dashboard', []);
    expect(result.removed).toEqual([]);
    expect(repo.list()).toHaveLength(1);
  });
});
