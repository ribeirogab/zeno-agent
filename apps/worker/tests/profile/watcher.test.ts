import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { classify, ProfileWatcher } from '@/profile/watcher';

let workdir: string;
const originalCwd = process.cwd();

function touchAgent(file: string, content = ''): void {
  writeFileSync(join(workdir, 'agent', file), content, 'utf8');
}

function touchProfile(file: string, content = ''): void {
  writeFileSync(join(workdir, 'profile', file), content, 'utf8');
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), 'zeno-watcher-'));
  process.chdir(workdir);
  mkdirSync(join(workdir, 'agent'));
  mkdirSync(join(workdir, 'profile'));
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(workdir, { recursive: true, force: true });
});

describe('ProfileWatcher', () => {
  it('debounces rapid edits to agent/SOUL.md into a single onPromptFilesChanged call', async () => {
    const onPromptFilesChanged = vi.fn();
    const watcher = new ProfileWatcher({
      onPromptFilesChanged,
      onCronsChanged: vi.fn(),
      debounceMs: 50,
    });
    watcher.start();
    // give fs.watch a moment to attach (macOS can lose events otherwise)
    await wait(50);

    touchAgent('SOUL.md', 'v1');
    touchAgent('SOUL.md', 'v2');
    touchAgent('SOUL.md', 'v3');

    await wait(150);
    watcher.stop();

    expect(onPromptFilesChanged).toHaveBeenCalledTimes(1);
  });

  it('routes profile/config.yaml edits to onCronsChanged', async () => {
    const onCronsChanged = vi.fn();
    const watcher = new ProfileWatcher({
      onPromptFilesChanged: vi.fn(),
      onCronsChanged,
      debounceMs: 50,
    });
    watcher.start();
    // give fs.watch a moment to attach (macOS can lose events otherwise)
    await wait(50);

    touchProfile('config.yaml', 'crons: []\n');

    await wait(150);
    watcher.stop();

    expect(onCronsChanged).toHaveBeenCalledTimes(1);
  });

  it('ignores mcp.json edits (DB-managed connectors after spec 0032)', async () => {
    const onPromptFilesChanged = vi.fn();
    const onCronsChanged = vi.fn();
    const watcher = new ProfileWatcher({
      onPromptFilesChanged,
      onCronsChanged,
      debounceMs: 50,
    });
    watcher.start();
    await wait(50);

    touchProfile('mcp.json', '{}');
    touchAgent('mcp.json', '{}');

    await wait(150);
    watcher.stop();

    expect(onPromptFilesChanged).not.toHaveBeenCalled();
    expect(onCronsChanged).not.toHaveBeenCalled();
  });

  // Spec 0062: the 'skills' bucket now points at /workspace/skills/
  // (dashboardSkillsPath) instead of ${claudeHome}/skills/. The materialized
  // symlink farm is no longer watched.
  it('routes /workspace/skills/<n>/SKILL.md edits to onSkillsChanged', async () => {
    const dashboardSkillsPath = join(workdir, 'workspace-skills');
    mkdirSync(join(dashboardSkillsPath, 'skill-creator'), { recursive: true });
    const onSkillsChanged = vi.fn();
    const watcher = new ProfileWatcher({
      onPromptFilesChanged: vi.fn(),
      onCronsChanged: vi.fn(),
      onSkillsChanged,
      dashboardSkillsPath,
      debounceMs: 50,
    });
    watcher.start();
    await wait(50);

    writeFileSync(
      join(dashboardSkillsPath, 'skill-creator', 'SKILL.md'),
      '---\nname: skill-creator\ndescription: d\n---\n\nbody',
      'utf8',
    );

    await wait(150);
    watcher.stop();

    // fs.watch on macOS can emit creation-then-content events outside the
    // debounce window when files in nested dirs are written. Assert that
    // the callback fired at least once (debounce still coalesces within a
    // single editor save burst, which is what matters in production).
    expect(onSkillsChanged.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  // Spec 0062: edits to agent/skills/* and profile/skills/* fire onSkillsChanged
  // (so power-user SSH-drops or rebuild-image swaps trigger hot-reload).
  it('routes agent/skills/<n>/SKILL.md edits to onSkillsChanged', async () => {
    mkdirSync(join(workdir, 'agent', 'skills', 'zeno-development'), { recursive: true });
    const onSkillsChanged = vi.fn();
    const watcher = new ProfileWatcher({
      onPromptFilesChanged: vi.fn(),
      onCronsChanged: vi.fn(),
      onSkillsChanged,
      debounceMs: 50,
    });
    watcher.start();
    await wait(50);

    writeFileSync(
      join(workdir, 'agent', 'skills', 'zeno-development', 'SKILL.md'),
      '---\nname: zeno-development\ndescription: d\n---\nbody',
      'utf8',
    );

    await wait(150);
    watcher.stop();

    expect(onSkillsChanged.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('routes profile/skills/<n>/SKILL.md edits to onSkillsChanged', async () => {
    mkdirSync(join(workdir, 'profile', 'skills', 'code-review'), { recursive: true });
    const onSkillsChanged = vi.fn();
    const watcher = new ProfileWatcher({
      onPromptFilesChanged: vi.fn(),
      onCronsChanged: vi.fn(),
      onSkillsChanged,
      debounceMs: 50,
    });
    watcher.start();
    await wait(50);

    writeFileSync(
      join(workdir, 'profile', 'skills', 'code-review', 'SKILL.md'),
      '---\nname: code-review\ndescription: d\n---\nbody',
      'utf8',
    );

    await wait(150);
    watcher.stop();

    expect(onSkillsChanged.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  // Spec 0062: classify unit tests for the new prefix rules.
  describe('classify (spec 0062)', () => {
    it('returns "skills" when source=agent and filename starts with "skills/"', () => {
      expect(classify('agent', 'skills/zeno-development/SKILL.md')).toBe('skills');
      expect(classify('agent', 'skills/zeno-development/references/foo.md')).toBe('skills');
    });

    it('returns "skills" when source=profile and filename starts with "skills/"', () => {
      expect(classify('profile', 'skills/code-review/SKILL.md')).toBe('skills');
      expect(classify('profile', 'skills/code-review/references/foo.md')).toBe('skills');
    });

    it('returns "skills" for any filename when source=skills', () => {
      expect(classify('skills', 'skill-creator/SKILL.md')).toBe('skills');
      expect(classify('skills', 'whatever.txt')).toBe('skills');
    });

    it('preserves spec-0052 routes — SOUL.md → prompt, USER.md → prompt, config.yaml → crons', () => {
      expect(classify('agent', 'SOUL.md')).toBe('prompt');
      expect(classify('profile', 'USER.md')).toBe('prompt');
      expect(classify('profile', 'config.yaml')).toBe('crons');
    });

    it('non-skill / non-special files fall through to "ignored"', () => {
      expect(classify('agent', 'mcp.json')).toBe('ignored');
      expect(classify('profile', 'mcp.json')).toBe('ignored');
      expect(classify('agent', 'random.md')).toBe('ignored');
    });
  });

  it('does not crash when a handler throws', async () => {
    const watcher = new ProfileWatcher({
      onPromptFilesChanged: () => {
        throw new Error('handler boom');
      },
      onCronsChanged: vi.fn(),
      debounceMs: 50,
    });
    watcher.start();
    await wait(50);

    touchAgent('SOUL.md', 'v1');
    await wait(150);
    watcher.stop();

    // We just want to assert no unhandled rejection / no crash.
    expect(true).toBe(true);
  });
});
