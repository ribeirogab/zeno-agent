/**
 * Spec 0053 — bootSkillsReconcile unit tests. Cover the UPSERT/INSERT-OR-IGNORE
 * split, orphan cleanup semantics, and the audit log.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeDatabase, type DB, openDatabase, runMigrations, SkillRepo } from '@zeno/storage';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootSkillsReconcile } from '@/skills/seed';

function mkSkill(root: string, name: string, description: string, body: string) {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${description}\n---\n${body}\n`,
  );
}

describe('bootSkillsReconcile (spec 0053)', () => {
  let tmp: string;
  let agentRoot: string;
  let profileRoot: string;
  let db: DB;
  let skills: SkillRepo;
  // Cast to a Logger-shaped mock; we only assert on `info`.
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
    tmp = mkdtempSync(join(tmpdir(), 'zeno-seed-'));
    agentRoot = join(tmp, 'agent', 'skills');
    profileRoot = join(tmp, 'profile', 'skills');
    mkdirSync(agentRoot, { recursive: true });
    mkdirSync(profileRoot, { recursive: true });
    db = openDatabase(':memory:');
    runMigrations(db);
    skills = new SkillRepo(db);
    logger.info.mockClear();
  });

  afterEach(() => {
    closeDatabase(db);
    rmSync(tmp, { recursive: true, force: true });
  });

  it('seeds zeno_default UPSERT and profile INSERT OR IGNORE', () => {
    mkSkill(agentRoot, 'zeno-development', 'workflow', '# Workflow');
    mkSkill(profileRoot, 'fn-code-review', 'review', '# Review');
    const report = bootSkillsReconcile({
      skills,
      agentSkillsRoot: agentRoot,
      profileSkillsRoot: profileRoot,
      logger,
    });
    expect(report).toEqual({
      zenoDefault: 1,
      profile: 1,
      orphansRemoved: [],
      cascadeAffected: 0,
    });
    expect(skills.list()).toHaveLength(2);
    const dev = skills.list().find((s) => s.name === 'zeno-development');
    const cr = skills.list().find((s) => s.name === 'fn-code-review');
    expect(dev?.source).toBe('zeno_default');
    expect(cr?.source).toBe('profile');
  });

  it('zeno_default UPSERT updates body on subsequent boots when file changes', () => {
    mkSkill(agentRoot, 'zeno-development', 'd', 'first');
    bootSkillsReconcile({
      skills,
      agentSkillsRoot: agentRoot,
      profileSkillsRoot: null,
      logger,
    });
    writeFileSync(
      join(agentRoot, 'zeno-development', 'SKILL.md'),
      `---\nname: zeno-development\ndescription: d\n---\nsecond\n`,
    );
    bootSkillsReconcile({
      skills,
      agentSkillsRoot: agentRoot,
      profileSkillsRoot: null,
      logger,
    });
    const updated = skills.list().find((s) => s.name === 'zeno-development');
    expect(updated?.body.trim()).toBe('second');
  });

  it('profile INSERT OR IGNORE preserves operator dashboard edits across boots', () => {
    mkSkill(profileRoot, 'fn-x', 'd', 'seeded body');
    bootSkillsReconcile({
      skills,
      agentSkillsRoot: agentRoot,
      profileSkillsRoot: profileRoot,
      logger,
    });
    const seeded = skills.list().find((s) => s.name === 'fn-x');
    if (!seeded) throw new Error('not seeded');
    // Simulate a dashboard edit.
    skills.update(seeded.id, { body: 'edited-by-user' });
    bootSkillsReconcile({
      skills,
      agentSkillsRoot: agentRoot,
      profileSkillsRoot: profileRoot,
      logger,
    });
    const after = skills.list().find((s) => s.name === 'fn-x');
    expect(after?.body).toBe('edited-by-user');
  });

  it('orphan cleanup deletes zeno_default rows when file disappears', () => {
    mkSkill(agentRoot, 'zeno-a', 'd', 'b');
    mkSkill(agentRoot, 'zeno-b', 'd', 'b');
    bootSkillsReconcile({
      skills,
      agentSkillsRoot: agentRoot,
      profileSkillsRoot: null,
      logger,
    });
    rmSync(join(agentRoot, 'zeno-b'), { recursive: true });
    const report = bootSkillsReconcile({
      skills,
      agentSkillsRoot: agentRoot,
      profileSkillsRoot: null,
      logger,
    });
    expect(report.orphansRemoved).toEqual(['zeno-b']);
    expect(skills.list().map((s) => s.name)).toEqual(['zeno-a']);
  });

  it('orphan cleanup does NOT delete profile rows when file disappears', () => {
    mkSkill(profileRoot, 'fn-x', 'd', 'b');
    bootSkillsReconcile({
      skills,
      agentSkillsRoot: agentRoot,
      profileSkillsRoot: profileRoot,
      logger,
    });
    rmSync(join(profileRoot, 'fn-x'), { recursive: true });
    const report = bootSkillsReconcile({
      skills,
      agentSkillsRoot: agentRoot,
      profileSkillsRoot: profileRoot,
      logger,
    });
    expect(report.orphansRemoved).toEqual([]);
    expect(skills.list().map((s) => s.name)).toEqual(['fn-x']);
  });

  it('orphan cleanup logs the audit event with names + cascadeAffected', () => {
    mkSkill(agentRoot, 'zeno-a', 'd', 'b');
    bootSkillsReconcile({
      skills,
      agentSkillsRoot: agentRoot,
      profileSkillsRoot: null,
      logger,
    });
    rmSync(join(agentRoot, 'zeno-a'), { recursive: true });
    logger.info.mockClear();
    bootSkillsReconcile({
      skills,
      agentSkillsRoot: agentRoot,
      profileSkillsRoot: null,
      logger,
    });
    const orphanCall = logger.info.mock.calls.find(
      // biome-ignore lint/suspicious/noExplicitAny: vitest mock
      (call: any[]) => call[0]?.event === 'skills_orphan_cleanup_complete',
    );
    expect(orphanCall).toBeDefined();
    expect(orphanCall?.[0]).toMatchObject({
      event: 'skills_orphan_cleanup_complete',
      removed: ['zeno-a'],
      cascadeAffected: 0,
    });
  });

  it('handles a missing agent/skills directory gracefully (zero defaults)', () => {
    const report = bootSkillsReconcile({
      skills,
      agentSkillsRoot: join(tmp, 'does-not-exist'),
      profileSkillsRoot: null,
      logger,
    });
    expect(report).toEqual({
      zenoDefault: 0,
      profile: 0,
      orphansRemoved: [],
      cascadeAffected: 0,
    });
    expect(skills.list()).toHaveLength(0);
  });

  it('handles a null profileSkillsRoot (no profile active)', () => {
    mkSkill(agentRoot, 'zeno-x', 'd', 'b');
    const report = bootSkillsReconcile({
      skills,
      agentSkillsRoot: agentRoot,
      profileSkillsRoot: null,
      logger,
    });
    expect(report).toEqual({
      zenoDefault: 1,
      profile: 0,
      orphansRemoved: [],
      cascadeAffected: 0,
    });
  });

  it('skips entries with malformed frontmatter', () => {
    const dir = join(agentRoot, 'broken-skill');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'), `not a valid SKILL.md — no frontmatter`);
    mkSkill(agentRoot, 'good-skill', 'd', 'b');
    const report = bootSkillsReconcile({
      skills,
      agentSkillsRoot: agentRoot,
      profileSkillsRoot: null,
      logger,
    });
    expect(report.zenoDefault).toBe(1);
    expect(skills.list().map((s) => s.name)).toEqual(['good-skill']);
  });

  // Spec 0053 defense in depth — malicious or buggy SKILL.md whose
  // frontmatter `name` would path-traverse must be rejected before reaching
  // the DB (the materializer would then escape ~/.claude/skills/).
  it.each([
    ['../escape', 'parent dir traversal'],
    ['foo/bar', 'nested path'],
    ['Foo-Skill', 'capital letter'],
    ['foo_skill', 'underscore'],
    ['foo skill', 'space'],
    ['', 'empty name (would still fail typeof check, but worth covering)'],
  ])('rejects skill with malformed frontmatter name "%s" (%s)', (name) => {
    const dir = join(agentRoot, 'wrapper');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: d\n---\nbody\n`);
    mkSkill(agentRoot, 'kebab-ok', 'd', 'b');
    const report = bootSkillsReconcile({
      skills,
      agentSkillsRoot: agentRoot,
      profileSkillsRoot: null,
      logger,
    });
    // Only the kebab-cased one survives.
    expect(report.zenoDefault).toBe(1);
    expect(skills.list().map((s) => s.name)).toEqual(['kebab-ok']);
  });

  it('cascade count reflects connector_skills rows linked to the orphaned skill', () => {
    mkSkill(agentRoot, 'zeno-a', 'd', 'b');
    bootSkillsReconcile({
      skills,
      agentSkillsRoot: agentRoot,
      profileSkillsRoot: null,
      logger,
    });
    const skill = skills.list()[0];
    if (!skill) throw new Error('seeded row missing');
    db.prepare(
      `INSERT INTO connectors (id, slug, display_name, source, transport)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('cid', 'echo', 'Echo', 'custom', 'stdio');
    db.prepare(`INSERT INTO connector_skills (connector_id, skill_id) VALUES (?, ?)`).run(
      'cid',
      skill.id,
    );
    rmSync(join(agentRoot, 'zeno-a'), { recursive: true });
    const report = bootSkillsReconcile({
      skills,
      agentSkillsRoot: agentRoot,
      profileSkillsRoot: null,
      logger,
    });
    expect(report.orphansRemoved).toEqual(['zeno-a']);
    expect(report.cascadeAffected).toBe(1);
  });
});
