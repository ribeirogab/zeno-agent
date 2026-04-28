import { beforeEach, describe, expect, it } from 'vitest';
import { type DB, openDatabase } from '../src/db.js';
import { runMigrations } from '../src/migrations.js';
import { ConnectorRepo } from '../src/repos/connectors.js';
import { CronConnectorRepo } from '../src/repos/cron-connectors.js';
import { CronRepo } from '../src/repos/crons.js';

let db: DB;
let crons: CronRepo;
let connectors: ConnectorRepo;
let links: CronConnectorRepo;

beforeEach(() => {
  db = openDatabase(':memory:');
  runMigrations(db);
  crons = new CronRepo(db);
  connectors = new ConnectorRepo(db);
  links = new CronConnectorRepo(db);
});

function seedCron(name: string) {
  return crons.create({ name, prompt: 'p', schedule: '0 9 * * *', source: 'chat' });
}

function seedConnector(slug: string) {
  return connectors.create({
    slug,
    displayName: slug,
    source: 'catalog',
    catalogId: slug,
    transport: 'remote',
    url: 'https://x',
    tools: [],
    secrets: [],
  });
}

describe('CronConnectorRepo', () => {
  it('listForCron returns linked connectors sorted by slug', () => {
    const cron = seedCron('cron');
    const linear = seedConnector('linear');
    const sentry = seedConnector('sentry');
    const github = seedConnector('github');
    links.add(cron.id, linear.id);
    links.add(cron.id, sentry.id);
    links.add(cron.id, github.id);
    const linked = links.listForCron(cron.id);
    expect(linked.map((x) => x.slug)).toEqual(['github', 'linear', 'sentry']);
  });

  it('listForConnector returns crons linked to a connector', () => {
    const c1 = seedCron('cron-a');
    const c2 = seedCron('cron-b');
    const linear = seedConnector('linear');
    links.add(c1.id, linear.id);
    links.add(c2.id, linear.id);
    const all = links.listForConnector(linear.id);
    expect(all).toHaveLength(2);
    expect(all.map((l) => l.cronId).sort()).toEqual([c1.id, c2.id].sort());
  });

  it('replaceForCron atomically replaces the link list', () => {
    const cron = seedCron('cron');
    const a = seedConnector('a');
    const b = seedConnector('b');
    const c = seedConnector('c');
    links.replaceForCron(cron.id, [a.id, b.id]);
    expect(
      links
        .listForCron(cron.id)
        .map((x) => x.slug)
        .sort(),
    ).toEqual(['a', 'b']);
    links.replaceForCron(cron.id, [b.id, c.id]);
    expect(
      links
        .listForCron(cron.id)
        .map((x) => x.slug)
        .sort(),
    ).toEqual(['b', 'c']);
    links.replaceForCron(cron.id, []);
    expect(links.listForCron(cron.id)).toEqual([]);
  });

  it('replaceForCron silently skips connector ids that do not exist', () => {
    const cron = seedCron('cron');
    const real = seedConnector('real');
    links.replaceForCron(cron.id, [real.id, 'fake-id']);
    expect(links.listForCron(cron.id)).toHaveLength(1);
  });

  it('cascade: deleting a cron removes its link rows', () => {
    db.exec('PRAGMA foreign_keys = ON;');
    const cron = seedCron('cron');
    const c = seedConnector('c');
    links.add(cron.id, c.id);
    expect(links.listForConnector(c.id)).toHaveLength(1);
    crons.delete(cron.id);
    expect(links.listForConnector(c.id)).toHaveLength(0);
  });

  it('cascade: deleting a connector removes its link rows', () => {
    db.exec('PRAGMA foreign_keys = ON;');
    const cron = seedCron('cron');
    const c = seedConnector('c');
    links.add(cron.id, c.id);
    expect(links.listForCron(cron.id)).toHaveLength(1);
    connectors.delete(c.id);
    expect(links.listForCron(cron.id)).toHaveLength(0);
  });

  it('add is idempotent (INSERT OR IGNORE)', () => {
    const cron = seedCron('cron');
    const c = seedConnector('c');
    links.add(cron.id, c.id);
    links.add(cron.id, c.id);
    expect(links.listForCron(cron.id)).toHaveLength(1);
  });

  it('remove returns true on success, false on missing pair', () => {
    const cron = seedCron('cron');
    const c = seedConnector('c');
    links.add(cron.id, c.id);
    expect(links.remove(cron.id, c.id)).toBe(true);
    expect(links.remove(cron.id, c.id)).toBe(false);
  });
});
