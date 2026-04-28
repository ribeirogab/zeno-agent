import { beforeEach, describe, expect, it } from 'vitest';
import { type DB, openDatabase } from '../src/db';
import { runMigrations } from '../src/migrations';
import { AgentCapabilityRepo } from '../src/repos/agent-capabilities';

let db: DB;
let repo: AgentCapabilityRepo;

beforeEach(() => {
  db = openDatabase(':memory:');
  runMigrations(db);
  repo = new AgentCapabilityRepo(db);
});

describe('AgentCapabilityRepo', () => {
  it('list returns all 10 seeded tools — 9 disabled + ToolSearch enabled (migrations 11+12)', () => {
    const caps = repo.list();
    expect(caps).toHaveLength(10);
    expect(caps.map((c) => c.toolName).sort()).toEqual([
      'Bash',
      'Edit',
      'Glob',
      'Grep',
      'Read',
      'Task',
      'ToolSearch',
      'WebFetch',
      'WebSearch',
      'Write',
    ]);
    for (const c of caps) {
      const expected = c.toolName === 'ToolSearch';
      expect(c.enabled).toBe(expected);
    }
  });

  it('isEnabled returns false initially for all seeded tools', () => {
    expect(repo.isEnabled('Bash')).toBe(false);
    expect(repo.isEnabled('Read')).toBe(false);
  });

  it('isEnabled returns false (safe default) for unknown tool names', () => {
    expect(repo.isEnabled('NonexistentTool')).toBe(false);
  });

  it('setEnabled flips the toggle', () => {
    repo.setEnabled('Bash', true);
    expect(repo.isEnabled('Bash')).toBe(true);
    repo.setEnabled('Bash', false);
    expect(repo.isEnabled('Bash')).toBe(false);
  });

  it('setEnabled bumps updated_at', async () => {
    const before = repo.list().find((c) => c.toolName === 'Bash');
    if (!before) throw new Error('Bash capability missing from seed');
    await new Promise((r) => setTimeout(r, 5));
    repo.setEnabled('Bash', true);
    const after = repo.list().find((c) => c.toolName === 'Bash');
    if (!after) throw new Error('Bash capability missing after update');
    expect(after.updatedAt).not.toBe(before.updatedAt);
  });

  it('setEnabled throws for unknown tool name', () => {
    expect(() => repo.setEnabled('NonexistentTool', true)).toThrow(/unknown tool/);
  });

  it('setMany updates multiple toggles atomically', () => {
    repo.setMany([
      { toolName: 'Read', enabled: true },
      { toolName: 'Edit', enabled: true },
      { toolName: 'Bash', enabled: true },
    ]);
    expect(repo.isEnabled('Read')).toBe(true);
    expect(repo.isEnabled('Edit')).toBe(true);
    expect(repo.isEnabled('Bash')).toBe(true);
    expect(repo.isEnabled('Write')).toBe(false);
  });

  it('setMany rolls back if any update fails', () => {
    expect(() =>
      repo.setMany([
        { toolName: 'Read', enabled: true },
        { toolName: 'NonexistentTool', enabled: true }, // throws
        { toolName: 'Edit', enabled: true },
      ]),
    ).toThrow();
    // Read change should have rolled back.
    expect(repo.isEnabled('Read')).toBe(false);
    expect(repo.isEnabled('Edit')).toBe(false);
  });
});
