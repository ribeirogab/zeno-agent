import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLogger } from '@zeno/logger';
import { openDatabase, runMigrations, SkillRepo } from '@zeno/storage';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { materializeSkillsToFs } from '@/skills/materialize';

const logger = createLogger({ service: 'test-materialize' });

describe('materializeSkillsToFs', () => {
  let claudeHome: string;
  let db: ReturnType<typeof openDatabase>;
  let skillRepo: SkillRepo;

  beforeEach(async () => {
    claudeHome = await mkdtemp(join(tmpdir(), 'zeno-materialize-'));
    db = openDatabase(':memory:');
    runMigrations(db);
    skillRepo = new SkillRepo(db);
  });

  afterEach(async () => {
    db.close();
  });

  it('writes one SKILL.md per DB row with reconstructed frontmatter', async () => {
    skillRepo.create({
      name: 'frontend-design',
      description: 'Padrão de UX e revisão de código React/Tailwind.',
      body: '# Frontend design review\n\nAntes de aprovar PR de frontend...',
    });
    skillRepo.create({
      name: 'aws-debug',
      description: 'Procedure de debug em produção AWS.',
      body: '# AWS debug runbook',
    });

    const result = await materializeSkillsToFs({ skillRepo, claudeHome, logger });
    expect(result).toEqual({ written: 2, deleted: 0 });

    const skillsRoot = join(claudeHome, 'skills');
    const dirs = await readdir(skillsRoot, { withFileTypes: true });
    expect(dirs.map((d) => d.name).sort()).toEqual(['aws-debug', 'frontend-design']);

    const fd = await readFile(join(skillsRoot, 'frontend-design', 'SKILL.md'), 'utf8');
    expect(fd).toContain('name: frontend-design');
    expect(fd).toContain('description: Padrão de UX e revisão de código React/Tailwind.');
    expect(fd).toContain('# Frontend design review');
  });

  it('deletes FS dirs that are no longer in DB (DB-deletion sync)', async () => {
    const a = skillRepo.create({ name: 'a', description: 'd', body: 'b' });
    skillRepo.create({ name: 'b', description: 'd', body: 'b' });
    await materializeSkillsToFs({ skillRepo, claudeHome, logger });

    const skillsRoot = join(claudeHome, 'skills');
    const before = await readdir(skillsRoot);
    expect(before.sort()).toEqual(['a', 'b']);

    skillRepo.delete(a.id);
    const result = await materializeSkillsToFs({ skillRepo, claudeHome, logger });
    expect(result).toEqual({ written: 1, deleted: 1 });

    const after = await readdir(skillsRoot);
    expect(after).toEqual(['b']);
  });

  it('overwrites SKILL.md when body changes (DB-edit sync)', async () => {
    const created = skillRepo.create({
      name: 'frontend-design',
      description: 'old',
      body: 'old body',
    });
    await materializeSkillsToFs({ skillRepo, claudeHome, logger });

    const path = join(claudeHome, 'skills', 'frontend-design', 'SKILL.md');
    const before = await readFile(path, 'utf8');
    expect(before).toContain('old body');
    expect(before).toContain('description: old');

    skillRepo.update(created.id, { description: 'new desc', body: 'new body' });
    await materializeSkillsToFs({ skillRepo, claudeHome, logger });

    const after = await readFile(path, 'utf8');
    expect(after).toContain('new body');
    expect(after).toContain('description: new desc');
    expect(after).not.toContain('old body');
  });

  it('cleans up pre-existing FS dirs that have no DB row (orphan cleanup)', async () => {
    const skillsRoot = join(claudeHome, 'skills');
    await mkdir(join(skillsRoot, 'orphan-skill'), { recursive: true });
    await writeFile(
      join(skillsRoot, 'orphan-skill', 'SKILL.md'),
      '---\nname: orphan-skill\n---\n\nstale',
      'utf8',
    );

    const result = await materializeSkillsToFs({ skillRepo, claudeHome, logger });
    expect(result).toEqual({ written: 0, deleted: 1 });

    const dirs = await readdir(skillsRoot);
    expect(dirs).toEqual([]);
  });

  it('is idempotent — calling twice with no DB changes is a no-op', async () => {
    skillRepo.create({ name: 'a', description: 'd', body: 'b' });
    const first = await materializeSkillsToFs({ skillRepo, claudeHome, logger });
    expect(first).toEqual({ written: 1, deleted: 0 });

    const second = await materializeSkillsToFs({ skillRepo, claudeHome, logger });
    expect(second).toEqual({ written: 1, deleted: 0 });

    const dirs = await readdir(join(claudeHome, 'skills'));
    expect(dirs).toEqual(['a']);
  });

  it('creates the skills/ root if it does not exist yet', async () => {
    skillRepo.create({ name: 'first', description: 'd', body: 'b' });

    // Note: claudeHome itself exists (created by beforeEach), but skills/ does not.
    const result = await materializeSkillsToFs({ skillRepo, claudeHome, logger });
    expect(result.written).toBe(1);

    const dirs = await readdir(join(claudeHome, 'skills'));
    expect(dirs).toEqual(['first']);
  });
});
