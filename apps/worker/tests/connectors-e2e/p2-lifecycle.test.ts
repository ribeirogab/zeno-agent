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

  // Spec 0057: channel installs flow through the same connector_create handler,
  // distinguished by `kind: 'channel'` in the payload. The API route synthesizes
  // all channel-specific defaults (transport='remote', tools=[], command/args/url=null);
  // the handler forwards `kind` to ConnectorRepo.create().
  it('P2.4 (spec 0057): connector_create with kind=channel lands in DB with kind=channel', async () => {
    const handler = buildConnectorCreateHandler(testDb.connectorRepo);
    const result = await handler(
      stubCommand('connector_create', {
        source: 'catalog',
        catalogId: 'slack',
        slug: 'slack',
        displayName: 'Slack',
        description: 'Talk to Zeno from Slack',
        transport: 'remote',
        command: null,
        args: null,
        url: null,
        kind: 'channel',
        secrets: [
          { key: 'SLACK_APP_TOKEN', value: 'xapp-x' },
          { key: 'SLACK_BOT_TOKEN', value: 'xoxb-x' },
        ],
        tools: [],
      }),
    );
    expect(result.ok).toBe(true);

    const channels = testDb.connectorRepo.listByKind('channel');
    expect(channels).toHaveLength(1);
    const slack = channels[0];
    if (!slack) throw new Error('slack channel not created');
    expect(slack.slug).toBe('slack');
    expect(slack.kind).toBe('channel');
    expect(slack.transport).toBe('remote');
    expect(slack.status).toBe('enabled');

    // Secrets attached
    const secrets = testDb.connectorRepo.getSecrets(slack.id);
    expect(secrets).toHaveLength(2);
    expect(secrets.map((s) => s.key).sort()).toEqual(['SLACK_APP_TOKEN', 'SLACK_BOT_TOKEN']);

    // No tools (channels have no MCP tools)
    expect(testDb.connectorRepo.getTools(slack.id)).toHaveLength(0);
  });

  it('P2.5 (spec 0057): connector_create without explicit kind defaults to mcp', async () => {
    fixture = bootFixture();
    const handler = buildConnectorCreateHandler(testDb.connectorRepo);
    const result = await handler(
      stubCommand('connector_create', {
        source: 'custom',
        slug: 'plain-mcp',
        displayName: 'Plain MCP',
        transport: 'stdio',
        command: fixture.command,
        args: fixture.args,
        secrets: [],
        tools: [],
        // kind omitted — should default to 'mcp'
      }),
    );
    expect(result.ok).toBe(true);

    const created = testDb.connectorRepo.getBySlug('plain-mcp');
    expect(created?.kind).toBe('mcp');
  });
});
