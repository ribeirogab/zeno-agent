import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { classify, ProfileWatcher } from '@/profile/watcher';

let tmpRoot: string;
const originalCwd = process.cwd();

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'zeno-knowledge-hr-'));
  process.chdir(tmpRoot);
  mkdirSync(join(tmpRoot, 'profile', 'knowledge'), { recursive: true });
  mkdirSync(join(tmpRoot, 'agent'), { recursive: true });
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('ProfileWatcher knowledge group', () => {
  it('classify routes knowledge edits to the knowledge bucket', () => {
    expect(classify('profile', 'knowledge/a.md')).toBe('knowledge');
    expect(classify('profile', 'knowledge/_drafts/x.md')).toBe('ignored');
    expect(classify('profile', 'knowledge/_index.md')).toBe('knowledge');
  });

  it('fires onKnowledgeChanged when a knowledge file is touched', async () => {
    const onKnowledgeChanged = vi.fn();
    const watcher = new ProfileWatcher({
      onPromptFilesChanged: vi.fn(),
      onKnowledgeChanged,
      debounceMs: 50,
    });
    watcher.start();
    await new Promise((r) => setTimeout(r, 50));

    writeFileSync(join(tmpRoot, 'profile', 'knowledge', 'a.md'), '---\ntitle: A\n---\nbody', 'utf8');
    await new Promise((r) => setTimeout(r, 200));
    watcher.stop();

    expect(onKnowledgeChanged.mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});
