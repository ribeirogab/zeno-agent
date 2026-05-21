import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CommandRepo,
  CronRepo,
  CronRunRepo,
  LogRepo,
  openRuntimeDatabase,
  type RuntimeDB,
  runRuntimeMigrations,
} from '@zeno/db/runtime';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '@/server';

let opened: ReturnType<typeof openRuntimeDatabase>;
let db: RuntimeDB;
let knowledgeRoot: string;

beforeEach(() => {
  opened = openRuntimeDatabase(':memory:');
  db = opened.drizzle;
  runRuntimeMigrations(opened.raw);
  knowledgeRoot = mkdtempSync(join(tmpdir(), 'zeno-knowledge-'));
});

function makeApp() {
  return createApp({
    config: {
      logLevel: 'info',
      workspaceDir: '/tmp',
      nodeEnv: 'test',
      port: 3000,
      masterKey: Buffer.alloc(32),
      profileId: 'test',
    },
    db,
    cronRepo: new CronRepo(db),
    cronRunRepo: new CronRunRepo(db),
    commandRepo: new CommandRepo(db),
    logRepo: new LogRepo(db),
    claudeHome: '/tmp',
    profileDir: '/tmp',
    knowledgeRoot,
  });
}

describe('GET /api/knowledge/files', () => {
  it('returns empty list on empty knowledge dir', async () => {
    const res = await makeApp().request('/api/knowledge/files');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ files: [], totalBytes: 0, totalFiles: 0 });
  });

  it('returns flat list with title/bytes/mtime/tags', async () => {
    writeFileSync(join(knowledgeRoot, 'foo.md'), '---\ntitle: Foo\ntags: [a, b]\n---\nbody');
    mkdirSync(join(knowledgeRoot, 'processes'));
    writeFileSync(join(knowledgeRoot, 'processes', 'release-flow.md'), '# Release Flow\nsteps');
    const res = await makeApp().request('/api/knowledge/files');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      files: Array<{ path: string; title: string; bytes: number; mtime: string; tags: string[] }>;
      totalBytes: number;
      totalFiles: number;
    };
    expect(body.totalFiles).toBe(2);
    const foo = body.files.find((f) => f.path === 'foo.md');
    expect(foo).toMatchObject({ title: 'Foo', tags: ['a', 'b'] });
    expect(typeof foo?.bytes).toBe('number');
    expect(foo?.mtime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const rf = body.files.find((f) => f.path === 'processes/release-flow.md');
    expect(rf?.title).toBe('Release Flow');
  });

  it('includes meta files (_index.md, _template.md) — UI filters', async () => {
    writeFileSync(join(knowledgeRoot, '_index.md'), '# index');
    writeFileSync(join(knowledgeRoot, '_template.md'), '# tpl');
    writeFileSync(join(knowledgeRoot, 'foo.md'), '# foo');
    const res = await makeApp().request('/api/knowledge/files');
    const body = (await res.json()) as { files: Array<{ path: string }> };
    const paths = body.files.map((f) => f.path).sort();
    expect(paths).toEqual(['_index.md', '_template.md', 'foo.md']);
  });
});

describe('GET /api/knowledge/file (happy path)', () => {
  it('returns content + frontmatter + wikilinks for an existing file', async () => {
    writeFileSync(
      join(knowledgeRoot, 'foo.md'),
      '---\ntitle: Foo\ntags: [a]\n---\nsee [[bar]] for more',
    );
    writeFileSync(join(knowledgeRoot, 'bar.md'), '# Bar');
    const res = await makeApp().request('/api/knowledge/file?path=foo.md');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      path: string;
      content: string;
      frontmatter: Record<string, unknown> | null;
      title: string;
      bytes: number;
      mtime: string;
      wikilinks: Record<string, string | null>;
    };
    expect(body.path).toBe('foo.md');
    expect(body.content).toBe('see [[bar]] for more');
    expect(body.frontmatter).toEqual({ title: 'Foo', tags: ['a'] });
    expect(body.title).toBe('Foo');
    expect(body.wikilinks).toEqual({ bar: 'bar.md' });
    expect(typeof body.bytes).toBe('number');
  });

  it('reports null for unresolved wikilink', async () => {
    writeFileSync(join(knowledgeRoot, 'foo.md'), 'see [[ghost]]');
    const res = await makeApp().request('/api/knowledge/file?path=foo.md');
    const body = (await res.json()) as { wikilinks: Record<string, string | null> };
    expect(body.wikilinks).toEqual({ ghost: null });
  });

  it('reports null for ambiguous wikilink', async () => {
    writeFileSync(join(knowledgeRoot, 'foo.md'), 'see [[bar]]');
    writeFileSync(join(knowledgeRoot, 'bar.md'), '# A');
    mkdirSync(join(knowledgeRoot, 'sub'));
    writeFileSync(join(knowledgeRoot, 'sub', 'bar.md'), '# B');
    const res = await makeApp().request('/api/knowledge/file?path=foo.md');
    const body = (await res.json()) as { wikilinks: Record<string, string | null> };
    expect(body.wikilinks).toEqual({ bar: null });
  });

  it('returns frontmatter: null and full body when YAML is malformed', async () => {
    const raw = '---\ntitle: "unclosed\n---\nbody here';
    writeFileSync(join(knowledgeRoot, 'broken.md'), raw);
    const res = await makeApp().request('/api/knowledge/file?path=broken.md');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      frontmatter: Record<string, unknown> | null;
      content: string;
    };
    expect(body.frontmatter).toBeNull();
    expect(body.content).toBe(raw);
  });
});

describe('GET /api/knowledge/file (error paths)', () => {
  it('rejects path traversal (..) with 400', async () => {
    const res = await makeApp().request('/api/knowledge/file?path=../../etc/passwd');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_path' });
  });

  it('rejects absolute path with 400', async () => {
    const res = await makeApp().request('/api/knowledge/file?path=/absolute/path.md');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_path' });
  });

  it('rejects non-md extension with 400', async () => {
    writeFileSync(join(knowledgeRoot, 'foo.txt'), 'plain');
    const res = await makeApp().request('/api/knowledge/file?path=foo.txt');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_path' });
  });

  it('rejects missing path query with 400', async () => {
    const res = await makeApp().request('/api/knowledge/file');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_path' });
  });

  it('returns 404 when file does not exist', async () => {
    const res = await makeApp().request('/api/knowledge/file?path=does-not-exist.md');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
  });

  it('rejects URL-encoded traversal', async () => {
    const res = await makeApp().request('/api/knowledge/file?path=%2E%2E%2Fsecret.md');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_path' });
  });
});
