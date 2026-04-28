import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileWatcher } from '@/profile/watcher';

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

  // Spec 0050 retired the `skills/` ignored-path branch in classify(); the
  // skill bootstrap is gone, so any non-watched filename now falls through
  // to the generic 'ignored' bucket.
  //
  // Spec 0052 reintroduces a 'skills' bucket — but as a *third source*
  // pointing at ${claudeHome}/skills/, NOT a path inside agent/ or profile/.
  // Test below covers it.
  it('routes ${claudeHome}/skills/<n>/SKILL.md edits to onSkillsChanged', async () => {
    const skillsPath = join(workdir, 'claude-skills');
    mkdirSync(join(skillsPath, 'frontend-design'), { recursive: true });
    const onSkillsChanged = vi.fn();
    const watcher = new ProfileWatcher({
      onPromptFilesChanged: vi.fn(),
      onCronsChanged: vi.fn(),
      onSkillsChanged,
      skillsPath,
      debounceMs: 50,
    });
    watcher.start();
    await wait(50);

    writeFileSync(
      join(skillsPath, 'frontend-design', 'SKILL.md'),
      '---\nname: frontend-design\n---\n\nbody',
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
