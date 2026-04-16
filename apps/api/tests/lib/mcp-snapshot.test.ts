import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { mcpSnapshot } from '@/lib/mcp-snapshot';

let profileDir: string;

beforeEach(() => {
  profileDir = mkdtempSync(join(tmpdir(), 'zeno-mcp-'));
});

describe('mcpSnapshot', () => {
  it('returns empty list when mcp.json missing', () => {
    expect(mcpSnapshot(profileDir)).toEqual([]);
  });

  it('classifies enabled servers with resolved env', () => {
    process.env.TEST_TOKEN_ABC = 'ok';
    writeFileSync(
      join(profileDir, 'mcp.json'),
      JSON.stringify({
        mcpServers: { foo: { command: 'x', env: { T: '${' + 'TEST_TOKEN_ABC}' } } },
      }),
    );
    const snap = mcpSnapshot(profileDir);
    expect(snap).toEqual([{ name: 'foo', status: 'enabled' }]);
    delete process.env.TEST_TOKEN_ABC;
  });

  it('classifies _disabled: true as disabled', () => {
    writeFileSync(
      join(profileDir, 'mcp.json'),
      JSON.stringify({ mcpServers: { foo: { command: 'x', _disabled: true } } }),
    );
    expect(mcpSnapshot(profileDir)).toEqual([{ name: 'foo', status: 'disabled' }]);
  });

  it('classifies missing env as skipped with reason', () => {
    writeFileSync(
      join(profileDir, 'mcp.json'),
      JSON.stringify({
        mcpServers: { foo: { command: 'x', env: { T: '${' + 'MISSING_ENV_VAR_42}' } } },
      }),
    );
    expect(mcpSnapshot(profileDir)).toEqual([
      { name: 'foo', status: 'skipped', reason: 'missing env: MISSING_ENV_VAR_42' },
    ]);
  });

  it('returns empty on malformed JSON', () => {
    writeFileSync(join(profileDir, 'mcp.json'), 'not json');
    expect(mcpSnapshot(profileDir)).toEqual([]);
  });
});
