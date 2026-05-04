import { beforeEach, describe, expect, it } from 'vitest';
import { type DB, openDatabase } from '../src/db';
import { runMigrations } from '../src/migrations';
import { ConnectorSkillRepo } from '../src/repos/connector-skills';
import { ConnectorRepo } from '../src/repos/connectors';
import { SkillRepo } from '../src/repos/skills';

let db: DB;
let connectors: ConnectorRepo;
let skills: SkillRepo;
let links: ConnectorSkillRepo;

beforeEach(() => {
  db = openDatabase(':memory:');
  runMigrations(db);
  connectors = new ConnectorRepo(db, {
    masterKey: Buffer.from('a'.repeat(64), 'hex'),
    profileId: 'test',
  });
  skills = new SkillRepo(db);
  links = new ConnectorSkillRepo(db);
});

function seedConnector(slug: string) {
  return connectors.create({
    slug,
    displayName: slug,
    source: 'catalog',
    catalogId: slug,
    transport: 'remote',
    url: 'https://x',
    secrets: [],
    tools: [],
  });
}

describe('ConnectorSkillRepo', () => {
  it('listForConnector returns linked skills sorted by name', () => {
    const c = seedConnector('sentry');
    const a = skills.create({ name: 'aws-debug', description: 'd', body: 'b' });
    const f = skills.create({ name: 'frontend-design', description: 'd', body: 'b' });
    const s = skills.create({ name: 'sentry-flow', description: 'd', body: 'b' });
    links.add(c.id, s.id);
    links.add(c.id, a.id);
    links.add(c.id, f.id);

    const linked = links.listForConnector(c.id);
    expect(linked.map((x) => x.name)).toEqual(['aws-debug', 'frontend-design', 'sentry-flow']);
  });

  it('listForSkill returns connectors linked to a skill', () => {
    const c1 = seedConnector('sentry');
    const c2 = seedConnector('linear');
    const s = skills.create({ name: 'shared-skill', description: 'd', body: 'b' });
    links.add(c1.id, s.id);
    links.add(c2.id, s.id);

    const all = links.listForSkill(s.id);
    expect(all).toHaveLength(2);
    expect(all.map((l) => l.connectorId).sort()).toEqual([c1.id, c2.id].sort());
  });

  it('replaceForConnector atomically replaces the link list', () => {
    const c = seedConnector('sentry');
    const a = skills.create({ name: 'a', description: 'd', body: 'b' });
    const b = skills.create({ name: 'b', description: 'd', body: 'b' });
    const cSkill = skills.create({ name: 'c', description: 'd', body: 'b' });

    links.replaceForConnector(c.id, [a.id, b.id]);
    expect(
      links
        .listForConnector(c.id)
        .map((x) => x.name)
        .sort(),
    ).toEqual(['a', 'b']);

    // Replace with a different set; b stays, c added, a removed.
    links.replaceForConnector(c.id, [b.id, cSkill.id]);
    expect(
      links
        .listForConnector(c.id)
        .map((x) => x.name)
        .sort(),
    ).toEqual(['b', 'c']);

    // Replace with empty array.
    links.replaceForConnector(c.id, []);
    expect(links.listForConnector(c.id)).toEqual([]);
  });

  it('replaceForConnector silently skips skill ids that do not exist', () => {
    const c = seedConnector('sentry');
    const real = skills.create({ name: 'real', description: 'd', body: 'b' });

    links.replaceForConnector(c.id, [real.id, 'fake-id', 'another-fake']);
    expect(links.listForConnector(c.id)).toHaveLength(1);
    expect(links.listForConnector(c.id)[0]?.id).toBe(real.id);
  });

  it('cascade: deleting a connector removes its link rows', () => {
    db.exec('PRAGMA foreign_keys = ON;');
    const c = seedConnector('sentry');
    const s = skills.create({ name: 's', description: 'd', body: 'b' });
    links.add(c.id, s.id);
    expect(links.listForSkill(s.id)).toHaveLength(1);

    connectors.delete(c.id);
    expect(links.listForSkill(s.id)).toHaveLength(0);
  });

  it('cascade: deleting a skill removes its link rows', () => {
    db.exec('PRAGMA foreign_keys = ON;');
    const c = seedConnector('sentry');
    const s = skills.create({ name: 's', description: 'd', body: 'b' });
    links.add(c.id, s.id);
    expect(links.listForConnector(c.id)).toHaveLength(1);

    skills.delete(s.id);
    expect(links.listForConnector(c.id)).toHaveLength(0);
  });

  it('add is idempotent (INSERT OR IGNORE)', () => {
    const c = seedConnector('sentry');
    const s = skills.create({ name: 's', description: 'd', body: 'b' });
    links.add(c.id, s.id);
    links.add(c.id, s.id); // no throw, no duplicate
    expect(links.listForConnector(c.id)).toHaveLength(1);
  });

  it('remove returns true on success, false on missing pair', () => {
    const c = seedConnector('sentry');
    const s = skills.create({ name: 's', description: 'd', body: 'b' });
    links.add(c.id, s.id);
    expect(links.remove(c.id, s.id)).toBe(true);
    expect(links.remove(c.id, s.id)).toBe(false);
  });
});
