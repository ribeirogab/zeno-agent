import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadAgentMcpConfig } from '@/agent/mcp';

const ORIGINAL_CWD = process.cwd();

let workDir: string;

beforeEach(() => {
  workDir = join(tmpdir(), `zeno-mcp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(workDir, 'agent'), { recursive: true });
  process.chdir(workDir);
});

afterEach(() => {
  process.chdir(ORIGINAL_CWD);
  rmSync(workDir, { recursive: true, force: true });
});

function writeAgentMcp(content: object): void {
  writeFileSync(join(workDir, 'agent', 'mcp.json'), JSON.stringify(content));
}

describe('loadAgentMcpConfig — built-in MCPs only (spec 0032)', () => {
  it('returns empty when agent/mcp.json missing', () => {
    expect(loadAgentMcpConfig()).toEqual({});
  });

  it('loads built-in servers from agent/mcp.json', () => {
    writeAgentMcp({
      mcpServers: {
        playwright: { command: 'npx', args: ['-y', '@playwright/mcp@latest'] },
      },
    });
    const result = loadAgentMcpConfig();
    expect(result.playwright).toMatchObject({
      command: 'npx',
      args: ['-y', '@playwright/mcp@latest'],
    });
  });

  it('skips servers with _disabled: true', () => {
    writeAgentMcp({
      mcpServers: {
        sentry: { _disabled: true, command: 'npx', args: [] },
      },
    });
    expect(loadAgentMcpConfig().sentry).toBeUndefined();
  });

  it('returns empty when JSON malformed', () => {
    writeFileSync(join(workDir, 'agent', 'mcp.json'), '{not valid json');
    expect(loadAgentMcpConfig()).toEqual({});
  });
});
