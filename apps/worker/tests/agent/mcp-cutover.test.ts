import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLogger } from '@zeno/logger';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { warnIfMcpJsonExists } from '@/agent/mcp-cutover';

const ORIGINAL_CWD = process.cwd();
let workDir: string;

beforeEach(() => {
  workDir = join(tmpdir(), `zeno-cutover-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(workDir, 'profile'), { recursive: true });
  process.chdir(workDir);
});

afterEach(() => {
  process.chdir(ORIGINAL_CWD);
  rmSync(workDir, { recursive: true, force: true });
});

describe('warnIfMcpJsonExists', () => {
  it('does nothing when profile/mcp.json is absent', () => {
    const logger = createLogger({ service: 'cutover-test' });
    const spy = vi.spyOn(logger, 'warn');
    warnIfMcpJsonExists(logger);
    expect(spy).not.toHaveBeenCalled();
  });

  it('emits one mcp_json_ignored warning with server names', () => {
    const logger = createLogger({ service: 'cutover-test' });
    const spy = vi.spyOn(logger, 'warn');
    writeFileSync(
      join(workDir, 'profile', 'mcp.json'),
      JSON.stringify({ mcpServers: { linear: {}, notion: {}, granola: {} } }),
    );
    warnIfMcpJsonExists(logger);
    expect(spy).toHaveBeenCalledTimes(1);
    const payload = spy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.event).toBe('mcp_json_ignored');
    expect(payload.servers).toEqual(['linear', 'notion', 'granola']);
  });

  it('uses placeholder when JSON is malformed', () => {
    const logger = createLogger({ service: 'cutover-test' });
    const spy = vi.spyOn(logger, 'warn');
    writeFileSync(join(workDir, 'profile', 'mcp.json'), '{not json');
    warnIfMcpJsonExists(logger);
    expect(spy).toHaveBeenCalledTimes(1);
    const payload = spy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.servers).toEqual(['<unparseable>']);
  });

  it('does not warn when mcpServers is empty', () => {
    const logger = createLogger({ service: 'cutover-test' });
    const spy = vi.spyOn(logger, 'warn');
    writeFileSync(join(workDir, 'profile', 'mcp.json'), '{"mcpServers":{}}');
    warnIfMcpJsonExists(logger);
    expect(spy).not.toHaveBeenCalled();
  });
});
