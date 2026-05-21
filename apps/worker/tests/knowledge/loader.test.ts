import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadKnowledgeBlock } from '@/knowledge/loader';

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'zeno-knowledge-loader-'));
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('loadKnowledgeBlock', () => {
  it('returns absent when the knowledge dir does not exist', () => {
    const out = loadKnowledgeBlock(join(tmpRoot, 'does-not-exist'));
    expect(out.source).toBe('absent');
    expect(out.content).toBe('');
    expect(out.fileCount).toBe(0);
  });

  it('uses _index.md when present and not stale', () => {
    writeFileSync(join(tmpRoot, '_index.md'), '<!-- on disk -->', 'utf8');
    writeFileSync(join(tmpRoot, 'a.md'), '---\ntitle: A\n---\n\n# A', 'utf8');
    const future = Date.now() / 1000 + 60;
    utimesSync(join(tmpRoot, '_index.md'), future, future);
    const out = loadKnowledgeBlock(tmpRoot);
    expect(out.source).toBe('index');
    expect(out.content).toContain('on disk');
  });

  it('falls back to scan when _index.md is missing', () => {
    writeFileSync(join(tmpRoot, 'a.md'), '---\ntitle: A\n---\n\nbody', 'utf8');
    const out = loadKnowledgeBlock(tmpRoot);
    expect(out.source).toBe('scan-missing');
    expect(out.fileCount).toBe(1);
    expect(out.content).toContain('# Knowledge Index');
  });

  it('falls back to scan when _index.md is stale (a.md is newer)', () => {
    writeFileSync(join(tmpRoot, '_index.md'), '<!-- old -->', 'utf8');
    writeFileSync(join(tmpRoot, 'a.md'), '---\ntitle: A\n---\n\nbody', 'utf8');
    const past = Date.now() / 1000 - 60;
    utimesSync(join(tmpRoot, '_index.md'), past, past);
    const out = loadKnowledgeBlock(tmpRoot);
    expect(out.source).toBe('scan-stale');
  });

  it('applies the 8 KB cap and reports truncation', () => {
    for (let i = 0; i < 80; i++) {
      mkdirSync(join(tmpRoot, `dir-${i}`), { recursive: true });
      writeFileSync(
        join(tmpRoot, `dir-${i}`, `file-${i}.md`),
        `---\ntitle: File ${i}\ndescription: ${'x'.repeat(100)}\n---\n\nbody`,
        'utf8',
      );
    }
    const out = loadKnowledgeBlock(tmpRoot);
    expect(out.truncated).toBe(true);
    expect(out.droppedCount).toBeGreaterThan(0);
    expect(out.content).toContain('files truncated');
  });
});
