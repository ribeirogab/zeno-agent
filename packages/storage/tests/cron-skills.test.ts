import { beforeEach, describe, expect, it } from 'vitest';
import { type DB, openDatabase } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { CronSkillRepo } from '../src/repos/cron-skills.js';
import { CronRepo } from '../src/repos/crons.js';
import { SkillRepo } from '../src/repos/skills.js';

let db: DB;
let crons: CronRepo;
let skills: SkillRepo;
let links: CronSkillRepo;

beforeEach(() => {
  db = openDatabase(':memory:');
  runMigrations(db);
  crons = new CronRepo(db);
  skills = new SkillRepo(db);
  links = new CronSkillRepo(db);
});

function seedCron(name: string) {
  return crons.create({
    name,
    prompt: 'p',
    schedule: '0 9 * * *',
    source: 'chat',
  });
}

describe('CronSkillRepo', () => {
  it('listForCron returns linked skills sorted by name', () => {
    const cron = seedCron('daily-standup');
    const a = skills.create({ name: 'aws-debug', description: 'd', body: 'b' });
    const f = skills.create({ name: 'widget-code-review', description: 'd', body: 'b' });
    const z = skills.create({ name: 'zeta', description: 'd', body: 'b' });
    links.add(cron.id, z.id);
    links.add(cron.id, a.id);
    links.add(cron.id, f.id);
    const linked = links.listForCron(cron.id);
    expect(linked.map((x) => x.name)).toEqual(['aws-debug', 'widget-code-review', 'zeta']);
  });

  it('listForSkill returns crons linked to a skill', () => {
    const c1 = seedCron('cron-a');
    const c2 = seedCron('cron-b');
    const s = skills.create({ name: 'shared', description: 'd', body: 'b' });
    links.add(c1.id, s.id);
    links.add(c2.id, s.id);
    const all = links.listForSkill(s.id);
    expect(all).toHaveLength(2);
    expect(all.map((l) => l.cronId).sort()).toEqual([c1.id, c2.id].sort());
  });

  it('replaceForCron atomically replaces the link list', () => {
    const cron = seedCron('cron');
    const a = skills.create({ name: 'a', description: 'd', body: 'b' });
    const b = skills.create({ name: 'b', description: 'd', body: 'b' });
    const c = skills.create({ name: 'c', description: 'd', body: 'b' });
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
    const real = skills.create({ name: 'r', description: 'd', body: 'b' });
    links.replaceForCron(cron.id, [real.id, 'fake-id']);
    expect(links.listForCron(cron.id)).toHaveLength(1);
  });

  it('cascade: deleting a cron removes its link rows', () => {
    db.exec('PRAGMA foreign_keys = ON;');
    const cron = seedCron('cron');
    const s = skills.create({ name: 's', description: 'd', body: 'b' });
    links.add(cron.id, s.id);
    expect(links.listForSkill(s.id)).toHaveLength(1);
    crons.delete(cron.id);
    expect(links.listForSkill(s.id)).toHaveLength(0);
  });

  it('cascade: deleting a skill removes its link rows', () => {
    db.exec('PRAGMA foreign_keys = ON;');
    const cron = seedCron('cron');
    const s = skills.create({ name: 's', description: 'd', body: 'b' });
    links.add(cron.id, s.id);
    expect(links.listForCron(cron.id)).toHaveLength(1);
    skills.delete(s.id);
    expect(links.listForCron(cron.id)).toHaveLength(0);
  });

  it('add is idempotent (INSERT OR IGNORE)', () => {
    const cron = seedCron('cron');
    const s = skills.create({ name: 's', description: 'd', body: 'b' });
    links.add(cron.id, s.id);
    links.add(cron.id, s.id);
    expect(links.listForCron(cron.id)).toHaveLength(1);
  });

  it('remove returns true on success, false on missing pair', () => {
    const cron = seedCron('cron');
    const s = skills.create({ name: 's', description: 'd', body: 'b' });
    links.add(cron.id, s.id);
    expect(links.remove(cron.id, s.id)).toBe(true);
    expect(links.remove(cron.id, s.id)).toBe(false);
  });
});
