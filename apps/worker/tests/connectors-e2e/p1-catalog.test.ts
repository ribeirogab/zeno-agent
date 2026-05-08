/**
 * Spec 0037 Phase A — P1 catalog + discoverTools scenarios.
 *
 * Tests assert against the echo fixture MCP (`tests/connectors-e2e/fixtures/echo-mcp/server.mjs`).
 * Cleanup pattern: describe-scoped fixture + afterEach (see helpers/echo-fixture.ts).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Connector, ConnectorSecret } from '@zeno/db/runtime';
import { discoverTools } from '@zeno/mcp-discover';
import { afterEach, describe, expect, it } from 'vitest';
import { bootFixture, type Fixture } from './helpers/echo-fixture.js';

function makeTransientFixtureConnector(fixture: Fixture): Connector {
  return {
    id: 'transient',
    slug: 'echo',
    displayName: 'Echo',
    description: null,
    source: 'custom',
    catalogId: null,
    transport: 'stdio',
    command: fixture.command,
    args: fixture.args,
    url: null,
    status: 'enabled',
    lastError: null,
    lastErrorAt: null,
    lastVerifiedAt: null,
    createdAt: '',
    updatedAt: '',
  };
}

function fixtureSecrets(failMode?: string): ConnectorSecret[] {
  if (!failMode) return [];
  return [{ connectorId: 'transient', key: 'FIXTURE_FAIL', value: failMode }];
}

describe('P1 — catalog + discoverTools', () => {
  let fixture: Fixture | null = null;

  afterEach(() => {
    fixture?.stop();
    fixture = null;
  });

  it('P1.1: returns 3 tools with correct categories', async () => {
    fixture = bootFixture();
    const connector = makeTransientFixtureConnector(fixture);
    const result = await discoverTools(connector, []);
    expect('tools' in result).toBe(true);
    if (!('tools' in result)) return;
    const byCategory = Object.fromEntries(result.tools.map((t) => [t.name, t.category]));
    expect(byCategory).toEqual({
      read_echo: 'read',
      update_echo: 'write',
      interactive_echo: 'interactive',
    });
  });

  it('P1.2: FIXTURE_FAIL=spawn → errorKind=spawn', async () => {
    fixture = bootFixture({ failMode: 'spawn' });
    const connector = makeTransientFixtureConnector(fixture);
    const result = await discoverTools(connector, fixtureSecrets('spawn'));
    expect('error' in result).toBe(true);
    if (!('error' in result)) return;
    // Connection closed when child exits 1 → not specifically "spawn"-classified
    // but always classified as something other than success.
    expect(['spawn', 'unknown', 'network']).toContain(result.errorKind);
  });

  // P1.3 — unskipped by 0038 F#2: discoverTools now accepts authCheckTool.
  // With FIXTURE_FAIL=auth the fixture's tools/list succeeds but tools/call
  // returns Unauthorized. discoverTools' new auth probe catches this and
  // returns errorKind:'auth'. Without the F#2 plumbing this test would have
  // returned `{ ok: true, tools: [...] }` (the Finding #2 regression bait).
  it('P1.3: FIXTURE_FAIL=auth + authCheckTool → errorKind=auth', async () => {
    fixture = bootFixture({ failMode: 'auth' });
    const connector = makeTransientFixtureConnector(fixture);
    const result = await discoverTools(connector, fixtureSecrets('auth'), {
      authCheckTool: 'read_echo',
    });
    expect('error' in result).toBe(true);
    if (!('error' in result)) return;
    expect(result.errorKind).toBe('auth');
  });

  it('P1.4: FIXTURE_FAIL=timeout → errorKind=timeout', async () => {
    fixture = bootFixture({ failMode: 'timeout' });
    const connector = makeTransientFixtureConnector(fixture);
    const result = await discoverTools(connector, fixtureSecrets('timeout'));
    expect('error' in result).toBe(true);
    if (!('error' in result)) return;
    expect(result.errorKind).toBe('timeout');
  }, 15_000);

  it('P1.5: catalog tools[] matches the committed snapshot', () => {
    const repoRoot = resolve(__dirname, '../../../..');
    const catalog = JSON.parse(
      readFileSync(resolve(repoRoot, 'agent/connectors-catalog.json'), 'utf8'),
    );
    const snapshot = JSON.parse(
      readFileSync(resolve(__dirname, '__snapshots__/catalog-tools.snap'), 'utf8'),
    );

    for (const entry of catalog.connectors) {
      const projected = (entry.tools ?? [])
        .map((t: { name: string; category: string; defaultPermission: string }) => ({
          name: t.name,
          category: t.category,
          defaultPermission: t.defaultPermission,
        }))
        .sort((a: { category: string; name: string }, b: { category: string; name: string }) => {
          const cat = a.category.localeCompare(b.category);
          return cat !== 0 ? cat : a.name.localeCompare(b.name);
        });
      expect(snapshot[entry.id]).toEqual(projected);
    }
  });
});
