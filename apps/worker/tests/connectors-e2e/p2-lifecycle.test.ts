/**
 * Spec 0037 Phase A — P2 connector lifecycle scenarios.
 *
 * Drives the worker's command handlers against an in-memory DB + the echo
 * fixture MCP. Verifies the full create/update/refresh/uninstall cycle
 * produces the expected DB state.
 */

import type { Command } from '@zeno/storage';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildConnectorCreateHandler } from '@/commands/handlers/connector-create';
import { buildConnectorRefreshToolsHandler } from '@/commands/handlers/connector-refresh-tools';
import { buildConnectorUninstallHandler } from '@/commands/handlers/connector-uninstall';
import { buildConnectorUpdateHandler } from '@/commands/handlers/connector-update';
import { bootFixture, type Fixture } from './helpers/echo-fixture.js';
import { makeTestDb, type TestDb } from './helpers/test-db.js';

function stubCommand(type: Command['type'], payload: object): Command {
  return {
    id: `test-${Math.random().toString(36).slice(2, 10)}`,
    type,
    payload: JSON.stringify(payload),
    status: 'pending',
    correlationId: 'p2-test',
    createdAt: new Date().toISOString(),
    processedAt: null,
    completedAt: null,
    result: null,
  };
}

describe('P2 — connector lifecycle', () => {
  let testDb: TestDb;
  let fixture: Fixture | null = null;

  beforeEach(() => {
    testDb = makeTestDb();
  });

  afterEach(() => {
    fixture?.stop();
    fixture = null;
    testDb.close();
  });

  it('P2.1: connector_create handler creates connector + secrets + tools rows', async () => {
    fixture = bootFixture();
    const handler = buildConnectorCreateHandler(testDb.connectorRepo);
    const result = await handler(
      stubCommand('connector_create', {
        source: 'custom',
        slug: 'echo',
        displayName: 'Echo',
        transport: 'stdio',
        command: fixture.command,
        args: fixture.args,
        secrets: [{ key: 'FAKE_TOKEN', value: 'fake-value-1234' }],
        tools: [
          { toolName: 'read_echo', description: 'r', category: 'read', permission: 'always_allow' },
        ],
      }),
    );
    expect(result.ok).toBe(true);

    const all = testDb.connectorRepo.list();
    expect(all).toHaveLength(1);
    const created = all[0];
    if (!created) throw new Error('no connector created');
    expect(created.slug).toBe('echo');
    expect(created.status).toBe('enabled');

    const secrets = testDb.connectorRepo.getSecrets(created.id);
    expect(secrets).toHaveLength(1);
    expect(secrets[0]?.key).toBe('FAKE_TOKEN');

    const tools = testDb.connectorRepo.getTools(created.id);
    expect(tools).toHaveLength(1);
    expect(tools[0]?.toolName).toBe('read_echo');
  });

  it('P2.2: connector_update handler replaces secrets and triggers internal verification', async () => {
    fixture = bootFixture();
    // Seed a connector first
    const created = testDb.connectorRepo.create({
      slug: 'echo',
      displayName: 'Echo',
      source: 'custom',
      transport: 'stdio',
      command: fixture.command,
      args: fixture.args,
      status: 'enabled',
      secrets: [{ key: 'FAKE_TOKEN', value: 'old-token-1234' }],
      tools: [],
    });
    const before = testDb.connectorRepo.getSecrets(created.id);
    const beforeLast4 = before[0]?.value.slice(-4);

    const handler = buildConnectorUpdateHandler(testDb.connectorRepo);
    const result = await handler(
      stubCommand('connector_update', {
        id: created.id,
        secrets: [{ key: 'FAKE_TOKEN', value: 'new-token-5678' }],
      }),
    );
    expect(result.ok).toBe(true);

    const after = testDb.connectorRepo.getSecrets(created.id);
    expect(after[0]?.value.slice(-4)).not.toBe(beforeLast4);
    expect(after[0]?.value.slice(-4)).toBe('5678');

    // The handler runs an internal discoverTools after replacing secrets;
    // our fixture is happy-path, so lastVerifiedAt should be populated.
    const refreshed = testDb.connectorRepo.get(created.id);
    expect(refreshed?.lastVerifiedAt).toBeTruthy();
    expect(refreshed?.lastError).toBeNull();
  }, 15_000);

  it('P2.3: connector_refresh_tools resets permissions to category defaults', async () => {
    fixture = bootFixture();
    const created = testDb.connectorRepo.create({
      slug: 'echo',
      displayName: 'Echo',
      source: 'custom',
      transport: 'stdio',
      command: fixture.command,
      args: fixture.args,
      status: 'enabled',
      secrets: [],
      tools: [
        // Pre-existing override that should be reset
        { toolName: 'read_echo', description: '', category: 'read', permission: 'never' },
      ],
    });

    const handler = buildConnectorRefreshToolsHandler(testDb.connectorRepo);
    const result = await handler(stubCommand('connector_refresh_tools', { id: created.id }));
    expect(result.ok).toBe(true);

    const tools = testDb.connectorRepo.getTools(created.id);
    expect(tools).toHaveLength(3); // fixture has 3 tools
    const readEcho = tools.find((t) => t.toolName === 'read_echo');
    expect(readEcho?.permission).toBe('always_allow'); // reset from 'never'
  }, 15_000);

  it('P2.4: connector_uninstall cascades to secrets, tools, and invocations', async () => {
    fixture = bootFixture();
    const created = testDb.connectorRepo.create({
      slug: 'echo',
      displayName: 'Echo',
      source: 'custom',
      transport: 'stdio',
      command: fixture.command,
      args: fixture.args,
      status: 'enabled',
      secrets: [{ key: 'TOKEN', value: 'abc1234' }],
      tools: [
        { toolName: 'read_echo', description: '', category: 'read', permission: 'always_allow' },
      ],
    });
    testDb.connectorRepo.recordInvocation({
      connectorId: created.id,
      toolName: 'read_echo',
      result: 'ok',
      durationMs: 42,
    });

    // Pre: counts non-zero
    expect(testDb.connectorRepo.getSecrets(created.id).length).toBeGreaterThan(0);
    expect(testDb.connectorRepo.getTools(created.id).length).toBeGreaterThan(0);
    expect(testDb.connectorRepo.recentInvocations(created.id, 10).length).toBeGreaterThan(0);

    const handler = buildConnectorUninstallHandler(testDb.connectorRepo);
    const result = await handler(stubCommand('connector_uninstall', { id: created.id }));
    expect(result.ok).toBe(true);

    expect(testDb.connectorRepo.get(created.id)).toBeNull();
    // Direct DB read to confirm cascade purged the child rows
    const sql = (q: string) => testDb.db.prepare(q).get(created.id) as { c: number };
    expect(sql(`SELECT COUNT(*) AS c FROM connector_secrets WHERE connector_id = ?`).c).toBe(0);
    expect(
      sql(`SELECT COUNT(*) AS c FROM connector_tool_permissions WHERE connector_id = ?`).c,
    ).toBe(0);
    expect(sql(`SELECT COUNT(*) AS c FROM connector_invocations WHERE connector_id = ?`).c).toBe(0);
  });
});
