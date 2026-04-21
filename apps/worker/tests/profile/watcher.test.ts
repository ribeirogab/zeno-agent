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
  mkdirSync(join(workdir, 'agent', 'skills'));
  mkdirSync(join(workdir, 'profile'));
  mkdirSync(join(workdir, 'profile', 'skills'));
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
      onMcpChanged: vi.fn(),
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
      onMcpChanged: vi.fn(),
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

  it('routes profile/mcp.json edits to onMcpChanged', async () => {
    const onMcpChanged = vi.fn();
    const watcher = new ProfileWatcher({
      onPromptFilesChanged: vi.fn(),
      onCronsChanged: vi.fn(),
      onMcpChanged,
      debounceMs: 50,
    });
    watcher.start();
    await wait(50);

    touchProfile('mcp.json', '{}');

    await wait(150);
    watcher.stop();

    expect(onMcpChanged).toHaveBeenCalledTimes(1);
  });

  it('routes agent/mcp.json edits to onMcpChanged', async () => {
    const onMcpChanged = vi.fn();
    const watcher = new ProfileWatcher({
      onPromptFilesChanged: vi.fn(),
      onCronsChanged: vi.fn(),
      onMcpChanged,
      debounceMs: 50,
    });
    watcher.start();
    await wait(50);

    touchAgent('mcp.json', '{}');

    await wait(150);
    watcher.stop();

    expect(onMcpChanged).toHaveBeenCalledTimes(1);
  });

  it('ignores edits under skills/ from either source', async () => {
    const onPromptFilesChanged = vi.fn();
    const onCronsChanged = vi.fn();
    const onMcpChanged = vi.fn();
    const watcher = new ProfileWatcher({
      onPromptFilesChanged,
      onCronsChanged,
      onMcpChanged,
      debounceMs: 50,
    });
    watcher.start();
    await wait(50);

    writeFileSync(join(workdir, 'agent', 'skills', 'foo.md'), 'hi', 'utf8');
    writeFileSync(join(workdir, 'profile', 'skills', 'bar.md'), 'hi', 'utf8');

    await wait(150);
    watcher.stop();

    expect(onPromptFilesChanged).not.toHaveBeenCalled();
    expect(onCronsChanged).not.toHaveBeenCalled();
    expect(onMcpChanged).not.toHaveBeenCalled();
  });

  it('does not crash when a handler throws', async () => {
    const watcher = new ProfileWatcher({
      onPromptFilesChanged: () => {
        throw new Error('handler boom');
      },
      onCronsChanged: vi.fn(),
      onMcpChanged: vi.fn(),
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
