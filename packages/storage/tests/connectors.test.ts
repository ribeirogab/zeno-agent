import { beforeEach, describe, expect, it } from 'vitest';
import { closeDatabase, type DB, openDatabase } from '../src/db';
import { runMigrations } from '../src/migrations';
import { ConnectorRepo } from '../src/repos/connectors';
import type { CreateConnectorInput } from '../src/types';

function freshDb(): DB {
  const db = openDatabase(':memory:');
  runMigrations(db);
  return db;
}

const baseInput: Omit<CreateConnectorInput, 'slug'> = {
  displayName: 'Echo',
  source: 'custom',
  transport: 'stdio',
  command: 'node',
  args: ['fixture.js'],
  secrets: [],
  tools: [],
};

describe('ConnectorRepo — list / get / getBySlug', () => {
  let db: DB;
  beforeEach(() => {
    db = freshDb();
  });

  it('list returns empty for fresh DB', () => {
    const repo = new ConnectorRepo(db);
    expect(repo.list()).toEqual([]);
    closeDatabase(db);
  });

  it('list filters by status and source', () => {
    const repo = new ConnectorRepo(db);
    repo.create({ ...baseInput, slug: 'a' });
    repo.create({ ...baseInput, slug: 'b', status: 'disabled' });
    repo.create({ ...baseInput, slug: 'c', source: 'catalog', catalogId: 'c' });

    expect(repo.list({ status: 'enabled' })).toHaveLength(2);
    expect(repo.list({ status: 'disabled' })).toHaveLength(1);
    expect(repo.list({ source: 'catalog' })).toHaveLength(1);
    expect(repo.list({ source: 'custom', status: 'enabled' })).toHaveLength(1);
    closeDatabase(db);
  });

  it('get and getBySlug return the same row', () => {
    const repo = new ConnectorRepo(db);
    const created = repo.create({ ...baseInput, slug: 'echo' });
    expect(repo.get(created.id)?.slug).toBe('echo');
    expect(repo.getBySlug('echo')?.id).toBe(created.id);
    expect(repo.get('nope')).toBeNull();
    expect(repo.getBySlug('nope')).toBeNull();
    closeDatabase(db);
  });
});

describe('ConnectorRepo — create', () => {
  it('inserts connector + secrets + tools in a transaction', () => {
    const db = freshDb();
    const repo = new ConnectorRepo(db);
    const created = repo.create({
      ...baseInput,
      slug: 'echo',
      secrets: [{ key: 'TOKEN', value: 'xyz' }],
      tools: [
        {
          toolName: 'read_echo',
          description: 'Echo via read',
          category: 'read',
          permission: 'always_allow',
        },
        {
          toolName: 'write_echo',
          description: null,
          category: 'write',
          permission: 'ask',
        },
      ],
    });
    expect(created.slug).toBe('echo');
    expect(created.args).toEqual(['fixture.js']);
    expect(repo.getSecrets(created.id)).toEqual([
      { connectorId: created.id, key: 'TOKEN', value: 'xyz', isPublic: false },
    ]);
    expect(repo.getTools(created.id)).toHaveLength(2);
    closeDatabase(db);
  });

  it('rolls back the transaction when a tool insert fails', () => {
    const db = freshDb();
    const repo = new ConnectorRepo(db);
    expect(() =>
      repo.create({
        ...baseInput,
        slug: 'bad',
        tools: [
          {
            toolName: 't',
            description: null,
            category: 'invalid' as never,
            permission: 'ask',
          },
        ],
      }),
    ).toThrow();
    // The connector row must NOT have been persisted
    expect(repo.getBySlug('bad')).toBeNull();
    closeDatabase(db);
  });

  it('rejects an invalid slug at the writer layer', () => {
    const db = freshDb();
    const repo = new ConnectorRepo(db);
    expect(() => repo.create({ ...baseInput, slug: 'Bad' })).toThrow(/invalid slug/);
    expect(() => repo.create({ ...baseInput, slug: 'bad_under' })).toThrow(/invalid slug/);
    expect(() => repo.create({ ...baseInput, slug: '' })).toThrow(/invalid slug/);
    closeDatabase(db);
  });

  it('enforces UNIQUE on slug at the DB layer', () => {
    const db = freshDb();
    const repo = new ConnectorRepo(db);
    repo.create({ ...baseInput, slug: 'echo' });
    expect(() => repo.create({ ...baseInput, slug: 'echo' })).toThrow();
    closeDatabase(db);
  });
});

describe('ConnectorRepo — update', () => {
  it('partial patch updates only the requested fields', async () => {
    const db = freshDb();
    const repo = new ConnectorRepo(db);
    const created = repo.create({ ...baseInput, slug: 'echo' });
    // Sleep long enough that the strftime('%f','now') millisecond bumps even on
    // very fast machines (better-sqlite3 caches its now() per call so SQLite is
    // generally OK, but the test asserts a millisecond-level change which is
    // racy; sleep > 1ms to guarantee it).
    await new Promise((r) => setTimeout(r, 5));
    const updated = repo.update(created.id, { displayName: 'Echo 2' });
    expect(updated.displayName).toBe('Echo 2');
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(created.updatedAt).getTime(),
    );
    expect(updated.command).toBe(created.command);
    closeDatabase(db);
  });

  it('clears nullable fields when set to null', () => {
    const db = freshDb();
    const repo = new ConnectorRepo(db);
    const created = repo.create({ ...baseInput, slug: 'echo' });
    repo.update(created.id, {
      lastError: 'boom',
      lastErrorAt: new Date().toISOString(),
    });
    repo.update(created.id, { lastError: null, lastErrorAt: null });
    const final = repo.get(created.id);
    expect(final?.lastError).toBeNull();
    expect(final?.lastErrorAt).toBeNull();
    closeDatabase(db);
  });

  it('returns current row when patch is empty', () => {
    const db = freshDb();
    const repo = new ConnectorRepo(db);
    const created = repo.create({ ...baseInput, slug: 'echo' });
    const same = repo.update(created.id, {});
    expect(same.updatedAt).toBe(created.updatedAt);
    closeDatabase(db);
  });
});

describe('ConnectorRepo — replaceSecrets / replaceTools', () => {
  it('replaceSecrets clears + inserts in one transaction', () => {
    const db = freshDb();
    const repo = new ConnectorRepo(db);
    const created = repo.create({
      ...baseInput,
      slug: 'echo',
      secrets: [{ key: 'A', value: '1' }],
    });
    repo.replaceSecrets(created.id, [
      { key: 'B', value: '2' },
      { key: 'C', value: '3' },
    ]);
    const secrets = repo.getSecrets(created.id);
    expect(secrets.map((s) => s.key)).toEqual(['B', 'C']);
    closeDatabase(db);
  });

  it('replaceTools wipes overrides and applies new set', () => {
    const db = freshDb();
    const repo = new ConnectorRepo(db);
    const created = repo.create({
      ...baseInput,
      slug: 'echo',
      tools: [{ toolName: 't1', description: null, category: 'read', permission: 'never' }],
    });
    repo.replaceTools(created.id, [
      { toolName: 't2', description: null, category: 'write', permission: 'ask' },
    ]);
    const tools = repo.getTools(created.id);
    expect(tools.map((t) => t.toolName)).toEqual(['t2']);
    expect(tools[0]?.permission).toBe('ask');
    closeDatabase(db);
  });
});

describe('ConnectorRepo — setToolPermission / setBulkPermission', () => {
  it('setToolPermission updates one row', () => {
    const db = freshDb();
    const repo = new ConnectorRepo(db);
    const created = repo.create({
      ...baseInput,
      slug: 'echo',
      tools: [
        { toolName: 't1', description: null, category: 'read', permission: 'ask' },
        { toolName: 't2', description: null, category: 'write', permission: 'ask' },
      ],
    });
    expect(repo.setToolPermission(created.id, 't1', 'always_allow')).toBe(true);
    const tools = repo.getTools(created.id);
    expect(tools.find((t) => t.toolName === 't1')?.permission).toBe('always_allow');
    expect(tools.find((t) => t.toolName === 't2')?.permission).toBe('ask');
  });

  it('setToolPermission returns false on tool miss', () => {
    const db = freshDb();
    const repo = new ConnectorRepo(db);
    const created = repo.create({ ...baseInput, slug: 'echo' });
    expect(repo.setToolPermission(created.id, 'missing', 'ask')).toBe(false);
  });

  it('setBulkPermission updates rows by category', () => {
    const db = freshDb();
    const repo = new ConnectorRepo(db);
    const created = repo.create({
      ...baseInput,
      slug: 'echo',
      tools: [
        { toolName: 'r1', description: null, category: 'read', permission: 'ask' },
        { toolName: 'r2', description: null, category: 'read', permission: 'ask' },
        { toolName: 'w1', description: null, category: 'write', permission: 'ask' },
      ],
    });
    expect(repo.setBulkPermission(created.id, 'read', 'always_allow')).toBe(2);
    const tools = repo.getTools(created.id);
    expect(
      tools.filter((t) => t.category === 'read').every((t) => t.permission === 'always_allow'),
    ).toBe(true);
    expect(tools.find((t) => t.toolName === 'w1')?.permission).toBe('ask');
  });
});

describe('ConnectorRepo — delete + cascade', () => {
  it('deletes connector and cascades secrets/tools/invocations', () => {
    const db = freshDb();
    const repo = new ConnectorRepo(db);
    const created = repo.create({
      ...baseInput,
      slug: 'echo',
      secrets: [{ key: 'K', value: 'V' }],
      tools: [{ toolName: 't1', description: null, category: 'read', permission: 'ask' }],
    });
    repo.recordInvocation({
      connectorId: created.id,
      toolName: 't1',
      result: 'ok',
      durationMs: 5,
    });
    expect(repo.delete(created.id)).toBe(true);
    expect(repo.get(created.id)).toBeNull();
    expect(repo.getSecrets(created.id)).toEqual([]);
    expect(repo.getTools(created.id)).toEqual([]);
    expect(repo.recentInvocations(created.id)).toEqual([]);
    closeDatabase(db);
  });

  it('returns false when deleting an unknown id', () => {
    const db = freshDb();
    const repo = new ConnectorRepo(db);
    expect(repo.delete('missing')).toBe(false);
    closeDatabase(db);
  });
});

describe('ConnectorRepo — invocations', () => {
  it('records and lists invocations newest-first', () => {
    const db = freshDb();
    const repo = new ConnectorRepo(db);
    const created = repo.create({ ...baseInput, slug: 'echo' });
    repo.recordInvocation({
      connectorId: created.id,
      toolName: 'a',
      result: 'ok',
      durationMs: 10,
    });
    repo.recordInvocation({
      connectorId: created.id,
      toolName: 'b',
      result: 'error',
      durationMs: 20,
      errorMessage: 'boom',
    });
    const recent = repo.recentInvocations(created.id);
    expect(recent.map((i) => i.toolName)).toEqual(['b', 'a']);
    expect(recent[0]?.errorMessage).toBe('boom');
    expect(recent[1]?.errorMessage).toBeNull();
    closeDatabase(db);
  });

  it('respects the limit argument', () => {
    const db = freshDb();
    const repo = new ConnectorRepo(db);
    const created = repo.create({ ...baseInput, slug: 'echo' });
    for (let i = 0; i < 25; i++) {
      repo.recordInvocation({
        connectorId: created.id,
        toolName: `t${i}`,
        result: 'ok',
        durationMs: i,
      });
    }
    expect(repo.recentInvocations(created.id, 5)).toHaveLength(5);
    expect(repo.recentInvocations(created.id, 100)).toHaveLength(25);
    closeDatabase(db);
  });

  it('countInvocationsSince counts rows after the timestamp', () => {
    const db = freshDb();
    const repo = new ConnectorRepo(db);
    const created = repo.create({ ...baseInput, slug: 'echo' });
    const before = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    repo.recordInvocation({
      connectorId: created.id,
      toolName: 'a',
      result: 'ok',
      durationMs: 1,
    });
    expect(repo.countInvocationsSince(created.id, before)).toBe(1);
    expect(
      repo.countInvocationsSince(created.id, new Date(Date.now() + 60_000).toISOString()),
    ).toBe(0);
    closeDatabase(db);
  });
});

describe('ConnectorRepo — getEnabledWithRelations', () => {
  it('returns enabled connectors with their secrets and tools attached', () => {
    const db = freshDb();
    const repo = new ConnectorRepo(db);
    repo.create({
      ...baseInput,
      slug: 'a',
      secrets: [{ key: 'K', value: 'V' }],
      tools: [{ toolName: 't', description: null, category: 'read', permission: 'always_allow' }],
    });
    repo.create({ ...baseInput, slug: 'b', status: 'disabled' });
    repo.create({ ...baseInput, slug: 'c', status: 'pending' });
    const enabled = repo.getEnabledWithRelations();
    expect(enabled).toHaveLength(1);
    expect(enabled[0]?.connector.slug).toBe('a');
    expect(enabled[0]?.secrets).toHaveLength(1);
    expect(enabled[0]?.tools).toHaveLength(1);
    closeDatabase(db);
  });
});

// Spec 0057: kind discriminator support — channels share storage with MCP
// connectors via the new 'kind' column.
describe('ConnectorRepo — kind discriminator (spec 0057)', () => {
  it('rowToConnector maps kind from DB row (defaults to mcp)', () => {
    const db = freshDb();
    const repo = new ConnectorRepo(db);
    const created = repo.create({ ...baseInput, slug: 'sentry' });
    expect(created.kind).toBe('mcp');
    closeDatabase(db);
  });

  it('create() accepts kind=channel and persists it', () => {
    const db = freshDb();
    const repo = new ConnectorRepo(db);
    const created = repo.create({
      ...baseInput,
      slug: 'slack',
      transport: 'remote',
      command: null,
      args: null,
      kind: 'channel',
    });
    expect(created.kind).toBe('channel');
    const fetched = repo.get(created.id);
    expect(fetched?.kind).toBe('channel');
    closeDatabase(db);
  });

  it('listByKind returns only matching kind', () => {
    const db = freshDb();
    const repo = new ConnectorRepo(db);
    repo.create({ ...baseInput, slug: 'sentry' }); // kind=mcp default
    repo.create({
      ...baseInput,
      slug: 'slack',
      transport: 'remote',
      command: null,
      args: null,
      kind: 'channel',
    });
    const channels = repo.listByKind('channel');
    expect(channels).toHaveLength(1);
    expect(channels[0]?.slug).toBe('slack');
    const mcps = repo.listByKind('mcp');
    expect(mcps).toHaveLength(1);
    expect(mcps[0]?.slug).toBe('sentry');
    closeDatabase(db);
  });

  it('list({ kind: "mcp" }) excludes channel rows', () => {
    const db = freshDb();
    const repo = new ConnectorRepo(db);
    repo.create({ ...baseInput, slug: 'sentry' });
    repo.create({
      ...baseInput,
      slug: 'slack',
      transport: 'remote',
      command: null,
      args: null,
      kind: 'channel',
    });
    const result = repo.list({ kind: 'mcp' });
    expect(result).toHaveLength(1);
    expect(result[0]?.slug).toBe('sentry');
    closeDatabase(db);
  });

  it('list() without kind filter returns ALL rows (backward compat)', () => {
    const db = freshDb();
    const repo = new ConnectorRepo(db);
    repo.create({ ...baseInput, slug: 'sentry' });
    repo.create({
      ...baseInput,
      slug: 'slack',
      transport: 'remote',
      command: null,
      args: null,
      kind: 'channel',
    });
    const result = repo.list();
    expect(result).toHaveLength(2);
    closeDatabase(db);
  });
});
