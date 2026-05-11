import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openRuntimeDatabase, type RuntimeDB, runRuntimeMigrations } from '../../src/runtime/db.js';
import { ConnectorRepo, type CreateConnectorInput } from '../../src/runtime/repos/connectors.js';
import type { DB as RawDB } from '../../src/shared/client.js';

let db: RuntimeDB;
let raw: RawDB;
let close: () => void;

function freshDb(): RuntimeDB {
  const opened = openRuntimeDatabase(':memory:');
  runRuntimeMigrations(opened.raw);
  // The new runtime baseline does NOT auto-seed (seedDefaultConnectors is
  // explicit). Tests start with empty connector tables — no extra cleanup
  // needed.
  raw = opened.raw;
  close = opened.close;
  return opened.drizzle;
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

afterEach(() => {
  close?.();
});

describe('ConnectorRepo — list / get / getBySlug', () => {
  beforeEach(() => {
    db = freshDb();
  });

  it('list returns empty for fresh DB', () => {
    const repo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
    expect(repo.list()).toEqual([]);
  });

  it('list filters by status and source', () => {
    const repo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
    repo.create({ ...baseInput, slug: 'a' });
    repo.create({ ...baseInput, slug: 'b', status: 'disabled' });
    repo.create({ ...baseInput, slug: 'c', source: 'catalog', catalogId: 'c' });

    expect(repo.list({ status: 'enabled' })).toHaveLength(2);
    expect(repo.list({ status: 'disabled' })).toHaveLength(1);
    expect(repo.list({ source: 'catalog' })).toHaveLength(1);
    expect(repo.list({ source: 'custom', status: 'enabled' })).toHaveLength(1);
  });

  it('get and getBySlug return the same row', () => {
    const repo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
    const created = repo.create({ ...baseInput, slug: 'echo' });
    expect(repo.get(created.id)?.slug).toBe('echo');
    expect(repo.getBySlug('echo')?.id).toBe(created.id);
    expect(repo.get('nope')).toBeNull();
    expect(repo.getBySlug('nope')).toBeNull();
  });
});

describe('ConnectorRepo — create', () => {
  beforeEach(() => {
    db = freshDb();
  });

  it('inserts connector + secrets + tools in a transaction', () => {
    const repo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
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
      {
        connectorId: created.id,
        key: 'TOKEN',
        value: 'xyz',
        isPublic: false,
        // Spec 2026-05-11: every secret row carries an updated_at default; assert
        // shape without pinning the exact timestamp.
        updatedAt: expect.any(String),
      },
    ]);
    expect(repo.getTools(created.id)).toHaveLength(2);
  });

  it('rolls back the transaction when a tool insert fails', () => {
    const repo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
    // Two tools with the same toolName violate the (connector_id, tool_name)
    // PK and trigger a runtime failure inside the transaction. The runtime
    // baseline does not carry the CHECK (category IN …) constraint that the
    // legacy storage migration had, so duplicating the PK is the cleanest way
    // to exercise rollback semantics.
    expect(() =>
      repo.create({
        ...baseInput,
        slug: 'bad',
        tools: [
          { toolName: 't', description: null, category: 'read', permission: 'ask' },
          { toolName: 't', description: null, category: 'read', permission: 'ask' },
        ],
      }),
    ).toThrow();
    // The connector row must NOT have been persisted
    expect(repo.getBySlug('bad')).toBeNull();
  });

  it('rejects an invalid slug at the writer layer', () => {
    const repo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
    expect(() => repo.create({ ...baseInput, slug: 'Bad' })).toThrow(/invalid slug/);
    expect(() => repo.create({ ...baseInput, slug: 'bad_under' })).toThrow(/invalid slug/);
    expect(() => repo.create({ ...baseInput, slug: '' })).toThrow(/invalid slug/);
  });

  it('enforces UNIQUE on slug at the DB layer', () => {
    const repo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
    repo.create({ ...baseInput, slug: 'echo' });
    expect(() => repo.create({ ...baseInput, slug: 'echo' })).toThrow();
  });
});

describe('ConnectorRepo — update', () => {
  beforeEach(() => {
    db = freshDb();
  });

  it('partial patch updates only the requested fields', async () => {
    const repo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
    const created = repo.create({ ...baseInput, slug: 'echo' });
    // Sleep long enough that the strftime('%f','now') millisecond bumps even on
    // very fast machines.
    await new Promise((r) => setTimeout(r, 5));
    const updated = repo.update(created.id, { displayName: 'Echo 2' });
    expect(updated.displayName).toBe('Echo 2');
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(created.updatedAt).getTime(),
    );
    expect(updated.command).toBe(created.command);
  });

  it('clears nullable fields when set to null', () => {
    const repo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
    const created = repo.create({ ...baseInput, slug: 'echo' });
    repo.update(created.id, {
      lastError: 'boom',
      lastErrorAt: new Date().toISOString(),
    });
    repo.update(created.id, { lastError: null, lastErrorAt: null });
    const final = repo.get(created.id);
    expect(final?.lastError).toBeNull();
    expect(final?.lastErrorAt).toBeNull();
  });

  it('returns current row when patch is empty', () => {
    const repo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
    const created = repo.create({ ...baseInput, slug: 'echo' });
    const same = repo.update(created.id, {});
    expect(same.updatedAt).toBe(created.updatedAt);
  });
});

describe('ConnectorRepo — replaceSecrets / replaceTools', () => {
  beforeEach(() => {
    db = freshDb();
  });

  it('replaceSecrets clears + inserts in one transaction', () => {
    const repo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
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
  });

  it('replaceSecrets bumps connector_secrets.updated_at on every call (spec 2026-05-11)', async () => {
    const repo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
    const created = repo.create({
      ...baseInput,
      slug: 'hot-reload',
      secrets: [{ key: 'K', value: 'v1' }],
    });
    const firstRow = raw
      .prepare('SELECT updated_at FROM connector_secrets WHERE connector_id = ? AND key = ?')
      .get(created.id, 'K') as { updated_at: string };
    // Wait long enough for the strftime('%Y-%m-%dT%H:%M:%fZ', 'now') millisecond resolution to advance.
    await new Promise((resolve) => setTimeout(resolve, 10));
    repo.replaceSecrets(created.id, [{ key: 'K', value: 'v2' }]);
    const secondRow = raw
      .prepare('SELECT updated_at FROM connector_secrets WHERE connector_id = ? AND key = ?')
      .get(created.id, 'K') as { updated_at: string };
    expect(secondRow.updated_at).not.toBe(firstRow.updated_at);
    expect(new Date(secondRow.updated_at).getTime()).toBeGreaterThan(
      new Date(firstRow.updated_at).getTime(),
    );
  });

  it('replaceTools wipes overrides and applies new set', () => {
    const repo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
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
  });
});

describe('ConnectorRepo — setToolPermission / setBulkPermission', () => {
  beforeEach(() => {
    db = freshDb();
  });

  it('setToolPermission updates one row', () => {
    const repo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
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
    const repo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
    const created = repo.create({ ...baseInput, slug: 'echo' });
    expect(repo.setToolPermission(created.id, 'missing', 'ask')).toBe(false);
  });

  it('setBulkPermission updates rows by category', () => {
    const repo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
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
  beforeEach(() => {
    db = freshDb();
  });

  it('deletes connector and cascades secrets/tools/invocations', () => {
    const repo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
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
  });

  it('returns false when deleting an unknown id', () => {
    const repo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
    expect(repo.delete('missing')).toBe(false);
  });
});

describe('ConnectorRepo — invocations', () => {
  beforeEach(() => {
    db = freshDb();
  });

  it('records and lists invocations newest-first', () => {
    const repo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
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
  });

  it('respects the limit argument', () => {
    const repo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
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
  });

  it('countInvocationsSince counts rows after the timestamp', () => {
    const repo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
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
  });
});

describe('ConnectorRepo — getEnabledWithRelations', () => {
  beforeEach(() => {
    db = freshDb();
  });

  it('returns enabled connectors with their secrets and tools attached', () => {
    const repo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
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
  });
});

// Spec 0057: kind discriminator support — channels share storage with MCP
// connectors via the new 'kind' column.
// Spec 2026-05-08-connectors-cli-first-design Q4: operator-supplied label.
describe('ConnectorRepo — instance_label (spec 2026-05-08)', () => {
  beforeEach(() => {
    db = freshDb();
  });

  it('persists instance_label on create and surfaces it on read', () => {
    const repo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
    const created = repo.create({
      ...baseInput,
      slug: 'linear-acme',
      displayName: 'Linear',
      instanceLabel: 'Acme workspace',
      source: 'catalog',
      catalogId: 'linear',
      transport: 'remote',
      command: null,
      args: null,
    });
    expect(created.instanceLabel).toBe('Acme workspace');
    const fetched = repo.get(created.id);
    expect(fetched?.instanceLabel).toBe('Acme workspace');
  });

  it('returns null instance_label for legacy rows that did not set it', () => {
    const repo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
    const created = repo.create({
      ...baseInput,
      slug: 'sentry',
      displayName: 'Sentry',
      source: 'catalog',
      catalogId: 'sentry',
    });
    expect(created.instanceLabel).toBeNull();
  });
});

describe('ConnectorRepo — kind discriminator (spec 0057)', () => {
  beforeEach(() => {
    db = freshDb();
  });

  it('rowToConnector maps kind from DB row (defaults to mcp)', () => {
    const repo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
    const created = repo.create({ ...baseInput, slug: 'sentry' });
    expect(created.kind).toBe('mcp');
  });

  it('create() accepts kind=channel and persists it', () => {
    const repo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
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
  });

  it('listByKind returns only matching kind', () => {
    const repo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
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
  });

  it('list({ kind: "mcp" }) excludes channel rows', () => {
    const repo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
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
  });

  it('list() without kind filter returns ALL rows (backward compat)', () => {
    const repo = new ConnectorRepo(db, {
      masterKey: Buffer.from('a'.repeat(64), 'hex'),
      profileId: 'test',
    });
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
  });
});
