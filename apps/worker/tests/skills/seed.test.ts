/**
 * Spec 0053 / 0062 — bootSkillsReconcile unit tests. Cover the
 * UPSERT/INSERT-OR-IGNORE split, orphan cleanup semantics, the audit log,
 * and (spec 0062) the dashboard volume scan + safety guard.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  openRuntimeDatabase,
  type RuntimeDB,
  runRuntimeMigrations,
  SkillRepo,
} from '@zeno/db/runtime';
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

describe('bootSkillsReconcile (spec 0053 + 0062)', () => {
  let tmp: string;
  let agentRoot: string;
  let profileRoot: string;
  let dashboardRoot: string;
  let opened: ReturnType<typeof openRuntimeDatabase>;
  let db: RuntimeDB;
  let skills: SkillRepo;
  // Cast to a Logger-shaped mock; we only assert on `info` / `warn`.
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
    dashboardRoot = join(tmp, 'workspace', 'skills');
    mkdirSync(agentRoot, { recursive: true });
    mkdirSync(profileRoot, { recursive: true });
    mkdirSync(dashboardRoot, { recursive: true });
    opened = openRuntimeDatabase(':memory:');
    db = opened.drizzle;
    runRuntimeMigrations(opened.raw);
    skills = new SkillRepo(db, {
      agentSkillsRoot: agentRoot,
      profileSkillsRoot: profileRoot,
      dashboardSkillsRoot: dashboardRoot,
    });
    logger.info.mockClear();
    logger.warn.mockClear();
  });

  afterEach(() => {
    opened.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  it('seeds zeno_default UPSERT and profile INSERT OR IGNORE', () => {
    mkSkill(agentRoot, 'zeno-development', 'workflow', '# Workflow');
    mkSkill(profileRoot, 'widget-code-review', 'review', '# Review');
    const report = bootSkillsReconcile({
      skills,
      agentSkillsRoot: agentRoot,
      profileSkillsRoot: profileRoot,
      dashboardSkillsRoot: dashboardRoot,
      logger,
    });
    expect(report).toMatchObject({
      zenoDefault: 1,
      profile: 1,
      dashboard: 0,
      orphansRemoved: [],
      cascadeAffected: 0,
      dashboardOrphansSkipped: [],
    });
    expect(skills.list()).toHaveLength(2);
    const dev = skills.list().find((s) => s.name === 'zeno-development');
    const cr = skills.list().find((s) => s.name === 'widget-code-review');
    expect(dev?.source).toBe('zeno_default');
    expect(cr?.source).toBe('profile');
  });

  it('zeno_default UPSERT updates description on subsequent boots when frontmatter changes', () => {
    mkSkill(agentRoot, 'zeno-development', 'first desc', '# Workflow v1');
    bootSkillsReconcile({
      skills,
      agentSkillsRoot: agentRoot,
      profileSkillsRoot: null,
      dashboardSkillsRoot: dashboardRoot,
      logger,
    });
    writeFileSync(
      join(agentRoot, 'zeno-development', 'SKILL.md'),
      `---\nname: zeno-development\ndescription: second desc\n---\n# Workflow v2\n`,
    );
    bootSkillsReconcile({
      skills,
      agentSkillsRoot: agentRoot,
      profileSkillsRoot: null,
      dashboardSkillsRoot: dashboardRoot,
      logger,
    });
    const updated = skills.list().find((s) => s.name === 'zeno-development');
    expect(updated?.description).toBe('second desc');
  });

  it('profile INSERT OR IGNORE preserves operator dashboard edits across boots', () => {
    mkSkill(profileRoot, 'widget-x', 'd', 'seeded body');
    bootSkillsReconcile({
      skills,
      agentSkillsRoot: agentRoot,
      profileSkillsRoot: profileRoot,
      dashboardSkillsRoot: dashboardRoot,
      logger,
    });
    const seeded = skills.list().find((s) => s.name === 'widget-x');
    if (!seeded) throw new Error('not seeded');
    // Simulate a dashboard edit (description only, post-spec-0062).
    skills.update(seeded.id, { description: 'edited-by-user' });
    bootSkillsReconcile({
      skills,
      agentSkillsRoot: agentRoot,
      profileSkillsRoot: profileRoot,
      dashboardSkillsRoot: dashboardRoot,
      logger,
    });
    const after = skills.list().find((s) => s.name === 'widget-x');
    expect(after?.description).toBe('edited-by-user');
  });

  it('orphan cleanup deletes zeno_default rows when file disappears', () => {
    mkSkill(agentRoot, 'zeno-a', 'd', 'b');
    mkSkill(agentRoot, 'zeno-b', 'd', 'b');
    bootSkillsReconcile({
      skills,
      agentSkillsRoot: agentRoot,
      profileSkillsRoot: null,
      dashboardSkillsRoot: dashboardRoot,
      logger,
    });
    rmSync(join(agentRoot, 'zeno-b'), { recursive: true });
    const report = bootSkillsReconcile({
      skills,
      agentSkillsRoot: agentRoot,
      profileSkillsRoot: null,
      dashboardSkillsRoot: dashboardRoot,
      logger,
    });
    expect(report.orphansRemoved).toEqual(['zeno-b']);
    expect(skills.list().map((s) => s.name)).toEqual(['zeno-a']);
  });

  it('orphan cleanup does NOT delete profile rows when file disappears', () => {
    mkSkill(profileRoot, 'widget-x', 'd', 'b');
    bootSkillsReconcile({
      skills,
      agentSkillsRoot: agentRoot,
      profileSkillsRoot: profileRoot,
      dashboardSkillsRoot: dashboardRoot,
      logger,
    });
    rmSync(join(profileRoot, 'widget-x'), { recursive: true });
    const report = bootSkillsReconcile({
      skills,
      agentSkillsRoot: agentRoot,
      profileSkillsRoot: profileRoot,
      dashboardSkillsRoot: dashboardRoot,
      logger,
    });
    expect(report.orphansRemoved).toEqual([]);
    expect(skills.list().map((s) => s.name)).toEqual(['widget-x']);
  });

  it('orphan cleanup logs the audit event with names + cascadeAffected', () => {
    mkSkill(agentRoot, 'zeno-a', 'd', 'b');
    bootSkillsReconcile({
      skills,
      agentSkillsRoot: agentRoot,
      profileSkillsRoot: null,
      dashboardSkillsRoot: dashboardRoot,
      logger,
    });
    rmSync(join(agentRoot, 'zeno-a'), { recursive: true });
    logger.info.mockClear();
    bootSkillsReconcile({
      skills,
      agentSkillsRoot: agentRoot,
      profileSkillsRoot: null,
      dashboardSkillsRoot: dashboardRoot,
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
      dashboardSkillsRoot: dashboardRoot,
      logger,
    });
    expect(report).toMatchObject({
      zenoDefault: 0,
      profile: 0,
      dashboard: 0,
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
      dashboardSkillsRoot: dashboardRoot,
      logger,
    });
    expect(report).toMatchObject({
      zenoDefault: 1,
      profile: 0,
      dashboard: 0,
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
      dashboardSkillsRoot: dashboardRoot,
      logger,
    });
    expect(report.zenoDefault).toBe(1);
    expect(skills.list().map((s) => s.name)).toEqual(['good-skill']);
  });

  // Spec 0053 defense in depth — malicious or buggy SKILL.md whose
  // frontmatter `name` would path-traverse must be rejected before reaching
  // the RuntimeDB (the materializer would then escape ~/.claude/skills/).
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
      dashboardSkillsRoot: dashboardRoot,
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
      dashboardSkillsRoot: dashboardRoot,
      logger,
    });
    const skill = skills.list()[0];
    if (!skill) throw new Error('seeded row missing');
    opened.raw
      .prepare(
        `INSERT INTO connectors (id, slug, display_name, source, transport)
       VALUES (?, ?, ?, ?, ?)`,
      )
      .run('cid', 'echo', 'Echo', 'custom', 'stdio');
    opened.raw
      .prepare(`INSERT INTO connector_skills (connector_id, skill_id) VALUES (?, ?)`)
      .run('cid', skill.id);
    rmSync(join(agentRoot, 'zeno-a'), { recursive: true });
    const report = bootSkillsReconcile({
      skills,
      agentSkillsRoot: agentRoot,
      profileSkillsRoot: null,
      dashboardSkillsRoot: dashboardRoot,
      logger,
    });
    expect(report.orphansRemoved).toEqual(['zeno-a']);
    expect(report.cascadeAffected).toBe(1);
  });

  // Spec 0062 — dashboard volume scan tests
  describe('dashboard volume scan (spec 0062)', () => {
    it('UPSERTs dashboard skills found at /workspace/skills/', () => {
      mkSkill(dashboardRoot, 'skill-creator', 'Builder for new skills', '# body');
      const report = bootSkillsReconcile({
        skills,
        agentSkillsRoot: agentRoot,
        profileSkillsRoot: null,
        dashboardSkillsRoot: dashboardRoot,
        logger,
      });
      expect(report.dashboard).toBe(1);
      const row = skills.getByName('skill-creator');
      expect(row?.source).toBe('dashboard');
      expect(row?.description).toBe('Builder for new skills');
    });

    it('safety guard: dashboard root MISSING → skip orphan cleanup, emit WARN', () => {
      // First boot seeds a dashboard skill.
      mkSkill(dashboardRoot, 'skill-creator', 'd', 'b');
      bootSkillsReconcile({
        skills,
        agentSkillsRoot: agentRoot,
        profileSkillsRoot: null,
        dashboardSkillsRoot: dashboardRoot,
        logger,
      });
      // Delete the entire dashboard root (simulate restored backup with no volume).
      rmSync(dashboardRoot, { recursive: true });
      logger.warn.mockClear();
      const report = bootSkillsReconcile({
        skills,
        agentSkillsRoot: agentRoot,
        profileSkillsRoot: null,
        dashboardSkillsRoot: dashboardRoot,
        logger,
      });
      // Row should still exist — safety guard refused to delete.
      expect(skills.getByName('skill-creator')).not.toBeNull();
      expect(report.dashboardOrphansSkipped).toEqual(['skill-creator']);
      const warnCall = logger.warn.mock.calls.find(
        // biome-ignore lint/suspicious/noExplicitAny: vitest mock
        (c: any[]) => c[0]?.event === 'skills_dashboard_orphan_cleanup_skipped',
      );
      expect(warnCall).toBeDefined();
    });

    it('safety guard: dashboard root EMPTY → skip orphan cleanup', () => {
      mkSkill(dashboardRoot, 'skill-creator', 'd', 'b');
      bootSkillsReconcile({
        skills,
        agentSkillsRoot: agentRoot,
        profileSkillsRoot: null,
        dashboardSkillsRoot: dashboardRoot,
        logger,
      });
      rmSync(join(dashboardRoot, 'skill-creator'), { recursive: true });
      // Root exists but is empty now.
      const report = bootSkillsReconcile({
        skills,
        agentSkillsRoot: agentRoot,
        profileSkillsRoot: null,
        dashboardSkillsRoot: dashboardRoot,
        logger,
      });
      // Row should still exist — safety guard refused to delete.
      expect(skills.getByName('skill-creator')).not.toBeNull();
      expect(report.dashboardOrphansSkipped).toEqual(['skill-creator']);
    });

    it('orphan cleanup runs when guard passes: deletes dashboard rows whose FS dir is missing', () => {
      mkSkill(dashboardRoot, 'a', 'd', 'b');
      mkSkill(dashboardRoot, 'b', 'd', 'b');
      bootSkillsReconcile({
        skills,
        agentSkillsRoot: agentRoot,
        profileSkillsRoot: null,
        dashboardSkillsRoot: dashboardRoot,
        logger,
      });
      // Delete one but keep the other. Guard passes (root exists + non-empty).
      rmSync(join(dashboardRoot, 'b'), { recursive: true });
      const report = bootSkillsReconcile({
        skills,
        agentSkillsRoot: agentRoot,
        profileSkillsRoot: null,
        dashboardSkillsRoot: dashboardRoot,
        logger,
      });
      // 'b' is gone, 'a' survives.
      expect(
        skills
          .list()
          .map((s) => s.name)
          .sort(),
      ).toEqual(['a']);
      expect(report.dashboardOrphansSkipped).toEqual([]);
    });

    it('skips .tmp-* extraction orphans during scan (they are not skills)', () => {
      mkSkill(dashboardRoot, 'real-skill', 'd', 'b');
      // Simulate a partial-extract orphan
      mkdirSync(join(dashboardRoot, '.tmp-abc123'), { recursive: true });
      writeFileSync(
        join(dashboardRoot, '.tmp-abc123', 'SKILL.md'),
        `---\nname: tmp-skill\ndescription: d\n---\nbody`,
      );
      const report = bootSkillsReconcile({
        skills,
        agentSkillsRoot: agentRoot,
        profileSkillsRoot: null,
        dashboardSkillsRoot: dashboardRoot,
        logger,
      });
      expect(report.dashboard).toBe(1); // only real-skill, not the .tmp- one
      expect(skills.list().map((s) => s.name)).toEqual(['real-skill']);
    });
  });
});
