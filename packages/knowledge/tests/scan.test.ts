import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { scanKnowledge } from '../src/scan.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = join(__dirname, 'fixtures', 'sample-tree');

describe('scanKnowledge', () => {
  it('skips _index.md, _template.md, and anything under a _-prefixed directory', () => {
    const files = scanKnowledge(FIXTURE_ROOT);
    const paths = files.map((f) => f.relPath);
    expect(paths).not.toContain('_index.md');
    expect(paths).not.toContain('_template.md');
    expect(paths).not.toContain('_drafts/wip.md');
  });

  it('returns FileMeta sorted by case-insensitive relPath', () => {
    const files = scanKnowledge(FIXTURE_ROOT);
    const paths = files.map((f) => f.relPath);
    expect(paths).toEqual([
      'about-me.md',
      'engineering/stack.md',
      'processes/release-flow.md',
    ]);
  });

  it('extracts title via fallback chain (frontmatter → H1 → filename)', () => {
    const files = scanKnowledge(FIXTURE_ROOT);
    expect(files.find((f) => f.relPath === 'about-me.md')?.title).toBe('About me');
    expect(files.find((f) => f.relPath === 'engineering/stack.md')?.title).toBe('Stack');
    expect(files.find((f) => f.relPath === 'processes/release-flow.md')?.title).toBe(
      'Release flow',
    );
  });

  it('extracts description, tags, related, bytes, and mtimeMs', () => {
    const files = scanKnowledge(FIXTURE_ROOT);
    const stack = files.find((f) => f.relPath === 'engineering/stack.md');
    expect(stack?.description).toBe('Languages and frameworks');
    expect(stack?.tags).toEqual(['engineering']);
    expect(stack?.related).toEqual([]);
    expect(stack?.bytes).toBeGreaterThan(0);
    expect(stack?.mtimeMs).toBeGreaterThan(0);
  });

  it('returns an empty array when the root does not exist', () => {
    expect(scanKnowledge(join(FIXTURE_ROOT, 'does-not-exist'))).toEqual([]);
  });
});
