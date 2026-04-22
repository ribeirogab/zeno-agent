import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isToolReadOnly, loadSkillRegistry } from '@/guardrails/skill-registry';

let tmpRoot: string;

function writeSkill(root: string, skillName: string, frontmatter: string): void {
  const dir = join(root, skillName);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'SKILL.md'),
    `---\n${frontmatter}\n---\n\n# ${skillName}\nbody\n`,
    'utf8',
  );
}

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'zeno-skill-registry-'));
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('loadSkillRegistry', () => {
  it('marks skills with read_only: true and ignores the rest', () => {
    writeSkill(tmpRoot, 'github-readonly', 'name: github-readonly\nread_only: true');
    writeSkill(tmpRoot, 'deployer', 'name: deployer\nread_only: false');
    writeSkill(tmpRoot, 'cron-management', 'name: cron-management');

    const registry = loadSkillRegistry([tmpRoot]);

    expect(registry.get('github-readonly')).toBe(true);
    expect(registry.has('deployer')).toBe(false);
    expect(registry.has('cron-management')).toBe(false);
  });

  it('returns an empty map when the roots are missing', () => {
    const registry = loadSkillRegistry([join(tmpRoot, 'does-not-exist')]);
    expect(registry.size).toBe(0);
  });

  it('skips skill folders without a SKILL.md', () => {
    mkdirSync(join(tmpRoot, 'no-skill-md'), { recursive: true });
    const registry = loadSkillRegistry([tmpRoot]);
    expect(registry.size).toBe(0);
  });
});

describe('isToolReadOnly', () => {
  const registry = new Map<string, boolean>([['acme', true]]);

  it('returns true when the MCP server matches a read-only skill', () => {
    expect(isToolReadOnly(registry, 'mcp__acme__list_clients')).toBe(true);
  });

  it('returns false when the MCP server is not in the registry', () => {
    expect(isToolReadOnly(registry, 'mcp__github__merge_pull_request')).toBe(false);
  });

  it('returns false for non-MCP tools (Bash, Read, etc.)', () => {
    expect(isToolReadOnly(registry, 'Bash')).toBe(false);
    expect(isToolReadOnly(registry, 'Read')).toBe(false);
  });

  it('returns false for malformed MCP tool names', () => {
    expect(isToolReadOnly(registry, 'mcp__justserver')).toBe(false);
  });
});
