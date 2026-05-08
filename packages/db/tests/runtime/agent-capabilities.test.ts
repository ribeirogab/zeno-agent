import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openRuntimeDatabase, type RuntimeDB, runRuntimeMigrations } from '../../src/runtime/db.js';
import { AgentCapabilityRepo } from '../../src/runtime/repos/agent-capabilities.js';
import { agentCapabilities } from '../../src/runtime/schema.js';

// Spec 0053 baseline seed mirrors legacy migrations 11/12/13:
// - 11 tools registered.
// - Bash/Edit/Glob/Grep/Read/Write enabled-by-default (migration 13: dev tools).
// - ToolSearch enabled-by-default (migration 12: harness loader).
// - Skill enabled-by-default.
// - Task/WebFetch/WebSearch stay disabled (opt-in via /settings).
const SEED: Array<{ toolName: string; enabled: number }> = [
  { toolName: 'Bash', enabled: 1 },
  { toolName: 'Edit', enabled: 1 },
  { toolName: 'Glob', enabled: 1 },
  { toolName: 'Grep', enabled: 1 },
  { toolName: 'Read', enabled: 1 },
  { toolName: 'Skill', enabled: 1 },
  { toolName: 'Task', enabled: 0 },
  { toolName: 'ToolSearch', enabled: 1 },
  { toolName: 'WebFetch', enabled: 0 },
  { toolName: 'WebSearch', enabled: 0 },
  { toolName: 'Write', enabled: 1 },
];

let db: RuntimeDB;
let close: () => void;
let repo: AgentCapabilityRepo;

beforeEach(() => {
  const opened = openRuntimeDatabase(':memory:');
  runRuntimeMigrations(opened.raw);
  db = opened.drizzle;
  close = opened.close;
  for (const row of SEED) {
    db.insert(agentCapabilities)
      .values({ toolName: row.toolName, enabled: row.enabled })
      .run();
  }
  repo = new AgentCapabilityRepo(db);
});

afterEach(() => {
  close();
});

describe('AgentCapabilityRepo', () => {
  it('list returns all 11 seeded tools — 8 enabled by default after spec 0053 (Bash/Edit/Glob/Grep/Read/Skill/ToolSearch/Write); 3 disabled (Task/WebFetch/WebSearch)', () => {
    const caps = repo.list();
    expect(caps).toHaveLength(11);
    expect(caps.map((c) => c.toolName).sort()).toEqual([
      'Bash',
      'Edit',
      'Glob',
      'Grep',
      'Read',
      'Skill',
      'Task',
      'ToolSearch',
      'WebFetch',
      'WebSearch',
      'Write',
    ]);
    const enabledByDefault = new Set([
      'Bash',
      'Edit',
      'Glob',
      'Grep',
      'Read',
      'Skill',
      'ToolSearch',
      'Write',
    ]);
    for (const c of caps) {
      expect(c.enabled).toBe(enabledByDefault.has(c.toolName));
    }
  });

  it('isEnabled returns true for default-on dev capabilities (spec 0053)', () => {
    expect(repo.isEnabled('Bash')).toBe(true);
    expect(repo.isEnabled('Read')).toBe(true);
    expect(repo.isEnabled('Edit')).toBe(true);
  });

  it('isEnabled returns false for sensitive tools that stay opt-in (Task/WebFetch/WebSearch)', () => {
    expect(repo.isEnabled('Task')).toBe(false);
    expect(repo.isEnabled('WebFetch')).toBe(false);
    expect(repo.isEnabled('WebSearch')).toBe(false);
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
    // Write was already enabled by default (spec 0053 migration 13). Verify it stays on.
    expect(repo.isEnabled('Write')).toBe(true);
  });

  it('setMany rolls back if any update fails', () => {
    // Pre-spec-0053 the seeded values for Read/Edit were 0, so post-rollback both were 0.
    // After spec 0053 migration 13 they default to 1, so the rollback restores them to 1.
    repo.setMany([
      { toolName: 'Read', enabled: false },
      { toolName: 'Edit', enabled: false },
    ]);
    expect(repo.isEnabled('Read')).toBe(false);
    expect(repo.isEnabled('Edit')).toBe(false);
    expect(() =>
      repo.setMany([
        { toolName: 'Read', enabled: true },
        { toolName: 'NonexistentTool', enabled: true }, // throws
        { toolName: 'Edit', enabled: true },
      ]),
    ).toThrow();
    // Read change should have rolled back to its pre-call value (false).
    expect(repo.isEnabled('Read')).toBe(false);
    expect(repo.isEnabled('Edit')).toBe(false);
  });
});
