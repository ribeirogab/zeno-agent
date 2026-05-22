import { beforeEach, describe, expect, it } from 'vitest';
import { openRuntimeDatabase, type RuntimeDB, runRuntimeMigrations } from '../../src/runtime/db.js';
import { CronSkillRepo } from '../../src/runtime/repos/cron-skills.js';
import { CronRepo } from '../../src/runtime/repos/crons.js';
import { SkillRepo } from '../../src/runtime/repos/skills.js';

let db: RuntimeDB;
let raw: ReturnType<typeof openRuntimeDatabase>['raw'];
let crons: CronRepo;
let skills: SkillRepo;
let links: CronSkillRepo;

beforeEach(() => {
  const opened = openRuntimeDatabase(':memory:');
  runRuntimeMigrations(opened.raw);
  db = opened.drizzle;
  raw = opened.raw;
  crons = new CronRepo(db);
  skills = new SkillRepo(db, {
    agentSkillsRoot: '/tmp/agent-skills',
    profileSkillsRoot: '/tmp/profile-skills',
    dashboardSkillsRoot: '/tmp/dashboard-skills',
  });
  links = new CronSkillRepo(db);
});

function seedCron(name: string) {
  return crons.upsertFromFile({
    slug: name,
    name,
    description: null,
    schedule: '0 9 * * *',
    enabled: true,
    contentHash: 'h',
    mtimeMs: 1,
    nextRunAt: null,
  });
}

describe('CronSkillRepo', () => {
  it('listForCron returns linked skills sorted by name', () => {
    const cron = seedCron('daily-standup');
    const a = skills.create({ name: 'aws-debug', description: 'd' });
    const f = skills.create({ name: 'widget-code-review', description: 'd' });
    const z = skills.create({ name: 'zeta', description: 'd' });
    links.add(cron.id, z.id);
    links.add(cron.id, a.id);
    links.add(cron.id, f.id);
    const linked = links.listForCron(cron.id);
    expect(linked.map((x) => x.name)).toEqual(['aws-debug', 'widget-code-review', 'zeta']);
  });

  it('listForSkill returns crons linked to a skill', () => {
    const c1 = seedCron('cron-a');
    const c2 = seedCron('cron-b');
    const s = skills.create({ name: 'shared', description: 'd' });
    links.add(c1.id, s.id);
    links.add(c2.id, s.id);
    const all = links.listForSkill(s.id);
    expect(all).toHaveLength(2);
    expect(all.map((l) => l.cronId).sort()).toEqual([c1.id, c2.id].sort());
  });

  it('replaceForCron atomically replaces the link list', () => {
    const cron = seedCron('cron');
    const a = skills.create({ name: 'a', description: 'd' });
    const b = skills.create({ name: 'b', description: 'd' });
    const c = skills.create({ name: 'c', description: 'd' });
    links.replaceForCron(cron.id, [a.id, b.id]);
    expect(
      links
        .listForCron(cron.id)
        .map((x) => x.name)
        .sort(),
    ).toEqual(['a', 'b']);
    links.replaceForCron(cron.id, [b.id, c.id]);
    expect(
      links
        .listForCron(cron.id)
        .map((x) => x.name)
        .sort(),
    ).toEqual(['b', 'c']);
    links.replaceForCron(cron.id, []);
    expect(links.listForCron(cron.id)).toEqual([]);
  });

  it('replaceForCron silently skips skill ids that do not exist', () => {
    const cron = seedCron('cron');
    const real = skills.create({ name: 'r', description: 'd' });
    links.replaceForCron(cron.id, [real.id, 'fake-id']);
    expect(links.listForCron(cron.id)).toHaveLength(1);
  });

  it('cascade: deleting a cron removes its link rows', () => {
    raw.exec('PRAGMA foreign_keys = ON;');
    const cron = seedCron('cron');
    const s = skills.create({ name: 's', description: 'd' });
    links.add(cron.id, s.id);
    expect(links.listForSkill(s.id)).toHaveLength(1);
    crons.delete(cron.id);
    expect(links.listForSkill(s.id)).toHaveLength(0);
  });

  it('cascade: deleting a skill removes its link rows', () => {
    raw.exec('PRAGMA foreign_keys = ON;');
    const cron = seedCron('cron');
    const s = skills.create({ name: 's', description: 'd' });
    links.add(cron.id, s.id);
    expect(links.listForCron(cron.id)).toHaveLength(1);
    skills.delete(s.id);
    expect(links.listForCron(cron.id)).toHaveLength(0);
  });

  it('add is idempotent (INSERT OR IGNORE)', () => {
    const cron = seedCron('cron');
    const s = skills.create({ name: 's', description: 'd' });
    links.add(cron.id, s.id);
    links.add(cron.id, s.id);
    expect(links.listForCron(cron.id)).toHaveLength(1);
  });

  it('remove returns true on success, false on missing pair', () => {
    const cron = seedCron('cron');
    const s = skills.create({ name: 's', description: 'd' });
    links.add(cron.id, s.id);
    expect(links.remove(cron.id, s.id)).toBe(true);
    expect(links.remove(cron.id, s.id)).toBe(false);
  });
});
