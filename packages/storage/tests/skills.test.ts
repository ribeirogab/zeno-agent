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
});
