import { lstat, mkdir, mkdtemp, readdir, readlink, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openRuntimeDatabase, runRuntimeMigrations, SkillRepo } from '@zeno/db/runtime';
import { createLogger } from '@zeno/logger';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanupTmpExtractDirs, materializeSkillsToFs } from '@/skills/materialize';

const logger = createLogger({ service: 'test-materialize' });

describe('materializeSkillsToFs (spec 0062 — symlink-based)', () => {
  let claudeHome: string;
  let agentSkillsRoot: string;
  let profileSkillsRoot: string;
  let dashboardSkillsRoot: string;
  let opened: ReturnType<typeof openRuntimeDatabase>;
  let skillRepo: SkillRepo;

  beforeEach(async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'zeno-materialize-'));
    claudeHome = join(sandbox, 'claude');
    agentSkillsRoot = join(sandbox, 'agent-skills');
    profileSkillsRoot = join(sandbox, 'profile-skills');
    dashboardSkillsRoot = join(sandbox, 'workspace-skills');
    await mkdir(claudeHome, { recursive: true });
    await mkdir(agentSkillsRoot, { recursive: true });
    await mkdir(profileSkillsRoot, { recursive: true });
    await mkdir(dashboardSkillsRoot, { recursive: true });
    opened = openRuntimeDatabase(':memory:');
    runRuntimeMigrations(opened.raw);
    skillRepo = new SkillRepo(opened.drizzle, {
      agentSkillsRoot,
      profileSkillsRoot,
      dashboardSkillsRoot,
    });
  });

  afterEach(async () => {
    opened.close();
  });

  async function seedFsContent(
    root: string,
    name: string,
    description: string,
    body: string,
  ): Promise<void> {
    const dir = join(root, name);
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'SKILL.md'),
      `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}`,
      'utf8',
    );
  }

  it('creates one symlink per RuntimeDB row pointing at canonicalPath', async () => {
    // Dashboard source: canonicalPath = dashboardSkillsRoot/<name>
    skillRepo.create({
      name: 'frontend-design',
      description: 'Padrão de UX e revisão de código React/Tailwind.',
    });
    await seedFsContent(dashboardSkillsRoot, 'frontend-design', 'd1', 'b1');

    skillRepo.upsertBySource({
      name: 'zeno-development',
      description: 'Develop Zeno itself',
      source: 'zeno_default',
    });
    await seedFsContent(agentSkillsRoot, 'zeno-development', 'd2', 'b2');

    const result = await materializeSkillsToFs({ skillRepo, claudeHome, logger });
    expect(result).toEqual({ written: 2, deleted: 0 });

    const skillsRoot = join(claudeHome, 'skills');
    const entries = await readdir(skillsRoot, { withFileTypes: true });
    expect(entries.map((e) => e.name).sort()).toEqual(['frontend-design', 'zeno-development']);

    // Each entry must be a symlink targeting the canonical FS path.
    for (const entry of entries) {
      const stat = await lstat(join(skillsRoot, entry.name));
      expect(stat.isSymbolicLink()).toBe(true);
    }
    expect(await readlink(join(skillsRoot, 'frontend-design'))).toBe(
      join(dashboardSkillsRoot, 'frontend-design'),
    );
    expect(await readlink(join(skillsRoot, 'zeno-development'))).toBe(
      join(agentSkillsRoot, 'zeno-development'),
    );
  });

  it('deletes orphan symlinks that no longer have a RuntimeDB row', async () => {
    const a = skillRepo.create({ name: 'a', description: 'd' });
    skillRepo.create({ name: 'b', description: 'd' });
    await seedFsContent(dashboardSkillsRoot, 'a', 'd', 'b');
    await seedFsContent(dashboardSkillsRoot, 'b', 'd', 'b');
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

  it('cleans up pre-existing legacy directories at the symlink path (post-spec-0052 → spec-0062 upgrade)', async () => {
    // Simulate a worker that booted on the old file-write strategy: it
    // wrote a real directory at ~/.claude/skills/legacy-skill/. After the
    // spec-0062 upgrade, that dir is no longer in RuntimeDB (or it is, but as
    // a different source). The materializer must clean it up.
    const skillsRoot = join(claudeHome, 'skills');
    await mkdir(join(skillsRoot, 'legacy-skill'), { recursive: true });
    await writeFile(
      join(skillsRoot, 'legacy-skill', 'SKILL.md'),
      '---\nname: legacy-skill\n---\n\nstale',
      'utf8',
    );

    const result = await materializeSkillsToFs({ skillRepo, claudeHome, logger });
    expect(result).toEqual({ written: 0, deleted: 1 });

    const entries = await readdir(skillsRoot);
    expect(entries).toEqual([]);
  });

  it('cleans up stale .tmp-* symlinks from a crashed prior rename', async () => {
    const skillsRoot = join(claudeHome, 'skills');
    await mkdir(skillsRoot, { recursive: true });
    // Simulate a crash mid-rename: a `.tmp-x` symlink that never got renamed.
    await symlink('/somewhere', join(skillsRoot, '.tmp-stale'), 'dir');

    const result = await materializeSkillsToFs({ skillRepo, claudeHome, logger });
    // 0 skills, but the .tmp- entry counts as "deleted" by the orphan pass.
    expect(result.deleted).toBe(1);
    const entries = await readdir(skillsRoot);
    expect(entries).toEqual([]);
  });

  it('is idempotent — calling twice with no RuntimeDB changes recreates the same symlinks', async () => {
    skillRepo.create({ name: 'a', description: 'd' });
    await seedFsContent(dashboardSkillsRoot, 'a', 'd', 'b');
    const first = await materializeSkillsToFs({ skillRepo, claudeHome, logger });
    expect(first).toEqual({ written: 1, deleted: 0 });

    const second = await materializeSkillsToFs({ skillRepo, claudeHome, logger });
    expect(second).toEqual({ written: 1, deleted: 0 });

    const skillsRoot = join(claudeHome, 'skills');
    const entries = await readdir(skillsRoot);
    expect(entries).toEqual(['a']);
    const stat = await lstat(join(skillsRoot, 'a'));
    expect(stat.isSymbolicLink()).toBe(true);
  });

  it('creates the skills/ root if it does not exist yet', async () => {
    skillRepo.create({ name: 'first', description: 'd' });
    await seedFsContent(dashboardSkillsRoot, 'first', 'd', 'b');

    const result = await materializeSkillsToFs({ skillRepo, claudeHome, logger });
    expect(result.written).toBe(1);

    const entries = await readdir(join(claudeHome, 'skills'));
    expect(entries).toEqual(['first']);
  });
});

describe('cleanupTmpExtractDirs (spec 0062 boot step 1)', () => {
  let dashboardSkillsRoot: string;

  beforeEach(async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'zeno-cleanup-tmp-'));
    dashboardSkillsRoot = join(sandbox, 'workspace-skills');
    await mkdir(dashboardSkillsRoot, { recursive: true });
  });

  it('removes .tmp-* dirs and leaves real skill dirs alone', async () => {
    await mkdir(join(dashboardSkillsRoot, '.tmp-abc123'), { recursive: true });
    await writeFile(
      join(dashboardSkillsRoot, '.tmp-abc123', 'SKILL.md'),
      'partial content',
      'utf8',
    );
    await mkdir(join(dashboardSkillsRoot, 'real-skill'), { recursive: true });
    await writeFile(
      join(dashboardSkillsRoot, 'real-skill', 'SKILL.md'),
      '---\nname: real-skill\n---\n\nbody',
      'utf8',
    );

    await cleanupTmpExtractDirs(dashboardSkillsRoot);

    const entries = await readdir(dashboardSkillsRoot);
    expect(entries).toEqual(['real-skill']);
  });

  it('is a no-op if the dashboard skills root does not exist (e.g., partial DR)', async () => {
    // Should not throw.
    await cleanupTmpExtractDirs('/this/path/definitely/does/not/exist');
  });

  it('is a no-op if the dashboard skills root is empty', async () => {
    await cleanupTmpExtractDirs(dashboardSkillsRoot);
    const entries = await readdir(dashboardSkillsRoot);
    expect(entries).toEqual([]);
  });
});
