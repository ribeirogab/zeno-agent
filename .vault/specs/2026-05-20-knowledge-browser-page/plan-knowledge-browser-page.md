# Knowledge Browser Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add read-only `/knowledge` route to the profile dashboard that surfaces `~/.zeno/profiles/<name>/knowledge/` as a tree + markdown viewer with resolvable wikilinks, backed by two new `GET` endpoints in `apps/api` that share `/app/knowledge` (already bind-mounted RO from spec 2026-05-20-knowledge-folder-per-profile).

**Architecture:** Three workspaces touched. `@zeno/knowledge` grows pure helpers `extractWikilinks` + `resolveWikilinks` (Node-safe, no React). `apps/api` (Hono) gains `/api/knowledge/files` + `/api/knowledge/file?path=…` — both server-side rendered: API returns pre-resolved `wikilinks: {slug → resolvedPath | null}` so the client stays a thin viewer. `apps/dashboard` adds a TanStack route, two react-query hooks, a tree component, a viewer component using `react-markdown` + `remark-gfm`, and a remark plugin that transforms `[[slug]]` text nodes into Link/broken-span based on the resolved map.

**Tech Stack:** TypeScript 6 strict; Hono 4; @zeno/knowledge (yaml@2); TanStack Router + react-query (@tanstack/react-query@5); react-markdown@9 + remark-gfm@4 (new deps); vitest@4 + @testing-library/react@16 (happy-dom env); biome for lint/format.

---

## File Structure

**Create:**

| File | Responsibility |
|---|---|
| `packages/knowledge/src/wikilink.ts` | `extractWikilinks(body)` + `resolveWikilinks(slugs, allPaths)`. Pure, Node-safe. |
| `packages/knowledge/tests/wikilink.test.ts` | Unit tests for both functions. |
| `apps/api/src/routes/knowledge.ts` | Hono router with `GET /files` + `GET /file`. Path-traversal guard. |
| `apps/api/tests/routes/knowledge.test.ts` | Route tests with tmpdir fixtures. |
| `apps/dashboard/src/lib/use-knowledge.ts` | `useKnowledgeFiles()` + `useKnowledgeFile(path)` react-query hooks. |
| `apps/dashboard/src/routes/_authed/knowledge.tsx` | Route + `validateSearch({file: z.string().optional()})`. |
| `apps/dashboard/src/components/knowledge/tree.tsx` | Recursive folder/file tree from flat paths. |
| `apps/dashboard/src/components/knowledge/viewer.tsx` | Header + react-markdown render. |
| `apps/dashboard/src/components/knowledge/wikilink-plugin.ts` | remark plugin transforming `[[slug]]` text nodes. |
| `apps/dashboard/src/components/knowledge/empty-state.tsx` | Empty pane copy with host path. |
| `apps/dashboard/tests/components/knowledge/tree.test.tsx` | Tree render tests. |
| `apps/dashboard/tests/components/knowledge/viewer.test.tsx` | Viewer + wikilink plugin integration tests. |

**Modify:**

| File | Change |
|---|---|
| `packages/knowledge/src/index.ts` | Re-export `extractWikilinks`, `resolveWikilinks`. |
| `apps/api/package.json` | Add `"@zeno/knowledge": "workspace:*"` to deps. |
| `apps/api/src/index.ts` | Resolve `KNOWLEDGE_CANDIDATES = ['/app/knowledge', 'knowledge']`, pass `knowledgeRoot` to `createApp`. |
| `apps/api/src/server.ts` | Add `knowledgeRoot: string` to `AppDeps`, mount `app.route('/api/knowledge', buildKnowledgeRoute({knowledgeRoot: deps.knowledgeRoot}))`. |
| `apps/api/tests/routes/health.test.ts` (and any other route tests calling `createApp` without `knowledgeRoot`) | Add `knowledgeRoot: '/tmp'` to the `makeApp` factory. |
| `apps/dashboard/package.json` | Add `react-markdown@^9.1.0` + `remark-gfm@^4.0.0` to deps. |
| `apps/dashboard/src/components/layout/dashboard-sidebar.tsx` | Add `{id:'knowledge', label:'knowledge', to:'/knowledge'}` to `NAV` between `connectors` and `skills`. Update `NavId` type + `navIdForPath`. |
| `apps/dashboard/tests/components/sidebar.test.tsx` | Update if hardcoded NAV labels are asserted. |
| `.vault/_index/learnings.md` | Will add learnings post-ship per "After completing a spec" reflection. |

---

## Phase 1 — `@zeno/knowledge` wikilink module

### Task 1: `extractWikilinks` — pull `[[slug]]` from markdown body

**Files:**
- Create: `packages/knowledge/src/wikilink.ts`
- Create: `packages/knowledge/tests/wikilink.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/knowledge/tests/wikilink.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { extractWikilinks } from '../src/wikilink.js';

describe('extractWikilinks', () => {
  it('returns empty array on body with no wikilinks', () => {
    expect(extractWikilinks('plain markdown body')).toEqual([]);
  });

  it('extracts a single bare slug', () => {
    expect(extractWikilinks('see [[other-note]] for details')).toEqual(['other-note']);
  });

  it('extracts multiple wikilinks in order, deduplicated', () => {
    const body = '[[alpha]] mentions [[beta]] and again [[alpha]] and finally [[gamma]]';
    expect(extractWikilinks(body)).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('extracts dir-prefixed slugs', () => {
    expect(extractWikilinks('cf [[processes/release-flow]]')).toEqual(['processes/release-flow']);
  });

  it('ignores wikilinks inside fenced code blocks', () => {
    const body = '```\nsee [[ignored]]\n```\nbut [[kept]] is fine';
    expect(extractWikilinks(body)).toEqual(['kept']);
  });

  it('ignores wikilinks inside inline code', () => {
    const body = 'literal `[[ignored]]` then real [[kept]]';
    expect(extractWikilinks(body)).toEqual(['kept']);
  });

  it('skips empty wikilinks []] and [[ ]] (whitespace-only)', () => {
    expect(extractWikilinks('[[]] and [[   ]] then [[real]]')).toEqual(['real']);
  });

  it('trims whitespace inside the wikilink', () => {
    expect(extractWikilinks('[[ spaced-slug ]]')).toEqual(['spaced-slug']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @zeno/knowledge test wikilink`

Expected: FAIL with module-not-found error (`Cannot find module '../src/wikilink.js'`).

- [ ] **Step 3: Implement `extractWikilinks`**

`packages/knowledge/src/wikilink.ts`:
```ts
/**
 * Pulls every `[[slug]]` from a markdown body.
 *
 * Skips fenced code blocks (triple backtick) and inline code (single backtick).
 * Trims whitespace inside the brackets. Returns slugs in first-appearance
 * order, deduplicated. Empty / whitespace-only wikilinks are dropped.
 */
export function extractWikilinks(body: string): string[] {
  const stripped = stripCode(body);
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /\[\[([^\[\]]*?)\]\]/g;
  let match: RegExpExecArray | null = re.exec(stripped);
  while (match !== null) {
    const slug = (match[1] ?? '').trim();
    if (slug.length > 0 && !seen.has(slug)) {
      seen.add(slug);
      out.push(slug);
    }
    match = re.exec(stripped);
  }
  return out;
}

function stripCode(body: string): string {
  // Drop fenced code blocks first (multiline).
  const noFences = body.replace(/```[\s\S]*?```/g, '');
  // Then drop inline code spans.
  return noFences.replace(/`[^`\n]*`/g, '');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @zeno/knowledge test wikilink`

Expected: PASS — all 8 assertions green.

- [ ] **Step 5: Commit**

```bash
git add packages/knowledge/src/wikilink.ts packages/knowledge/tests/wikilink.test.ts
git commit -m "feat(knowledge): extractWikilinks pulls [[slug]] tokens from md body"
```

---

### Task 2: `resolveWikilinks` — map slugs to file paths

**Files:**
- Modify: `packages/knowledge/src/wikilink.ts` (append)
- Modify: `packages/knowledge/tests/wikilink.test.ts` (append)

- [ ] **Step 1: Append failing tests**

`packages/knowledge/tests/wikilink.test.ts` (append below existing block):
```ts
import { resolveWikilinks } from '../src/wikilink.js';

describe('resolveWikilinks', () => {
  it('returns empty object on empty input', () => {
    expect(resolveWikilinks([], ['foo.md'])).toEqual({});
  });

  it('resolves a bare slug to a root-level file', () => {
    expect(resolveWikilinks(['foo'], ['foo.md', 'bar.md'])).toEqual({ foo: 'foo.md' });
  });

  it('resolves a bare slug to a file in a subfolder', () => {
    expect(resolveWikilinks(['release-flow'], ['processes/release-flow.md'])).toEqual({
      'release-flow': 'processes/release-flow.md',
    });
  });

  it('returns null when slug is ambiguous (multiple matches)', () => {
    const out = resolveWikilinks(['foo'], ['foo.md', 'sub/foo.md']);
    expect(out).toEqual({ foo: null });
  });

  it('resolves dir-prefixed slug exactly', () => {
    const out = resolveWikilinks(
      ['processes/release-flow'],
      ['processes/release-flow.md', 'other/release-flow.md'],
    );
    expect(out).toEqual({ 'processes/release-flow': 'processes/release-flow.md' });
  });

  it('returns null when slug has no match', () => {
    expect(resolveWikilinks(['ghost'], ['foo.md'])).toEqual({ ghost: null });
  });

  it('handles multiple slugs in one call', () => {
    const out = resolveWikilinks(
      ['foo', 'ghost', 'bar'],
      ['foo.md', 'bar.md', 'sub/bar.md'],
    );
    expect(out).toEqual({ foo: 'foo.md', ghost: null, bar: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @zeno/knowledge test wikilink`

Expected: FAIL with `resolveWikilinks is not a function` or import error.

- [ ] **Step 3: Implement `resolveWikilinks`**

Append to `packages/knowledge/src/wikilink.ts`:
```ts
/**
 * Maps each slug to a single resolved relative path or `null`.
 *
 * Resolution rules mirror @zeno/knowledge `resolveRelated`:
 *  - Bare `foo` matches any `.md` whose basename is `foo.md`. Ambiguous → null.
 *  - Prefixed `dir/foo` matches any `.md` that starts with `dir/` and whose
 *    basename is `foo.md`. Ambiguous → null. Exact-prefix only — no fuzzy.
 *
 * The resulting object always has one key per input slug (no slug is dropped),
 * with value either the resolved relative path or `null`.
 */
export function resolveWikilinks(
  slugs: string[],
  allPaths: string[],
): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const slug of slugs) {
    const matches = candidatesForSlug(allPaths, slug);
    out[slug] = matches.length === 1 ? (matches[0] ?? null) : null;
  }
  return out;
}

function candidatesForSlug(allPaths: string[], slug: string): string[] {
  if (slug.includes('/')) {
    const lastSlash = slug.lastIndexOf('/');
    const dirPrefix = slug.slice(0, lastSlash);
    const baseName = slug.slice(lastSlash + 1);
    const target = `${baseName}.md`;
    return allPaths.filter((p) => {
      if (!p.startsWith(`${dirPrefix}/`)) return false;
      const parts = p.split('/');
      const last = parts[parts.length - 1] ?? '';
      return last === target;
    });
  }
  const target = `${slug}.md`;
  return allPaths.filter((p) => p === target || p.endsWith(`/${target}`));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @zeno/knowledge test wikilink`

Expected: PASS — all 7 `resolveWikilinks` assertions green; existing `extractWikilinks` assertions still green.

- [ ] **Step 5: Commit**

```bash
git add packages/knowledge/src/wikilink.ts packages/knowledge/tests/wikilink.test.ts
git commit -m "feat(knowledge): resolveWikilinks maps slug list to resolved paths"
```

---

### Task 3: Export from `@zeno/knowledge` index

**Files:**
- Modify: `packages/knowledge/src/index.ts`

- [ ] **Step 1: Add the re-export**

Append to `packages/knowledge/src/index.ts`:
```ts
export { extractWikilinks, resolveWikilinks } from './wikilink.js';
```

- [ ] **Step 2: Build the package**

Run: `pnpm --filter @zeno/knowledge build`

Expected: tsc emits `dist/wikilink.js`, `dist/wikilink.d.ts`, and `dist/index.js` re-exports the new functions. No error.

- [ ] **Step 3: Verify the import surface from a consumer**

Run: `node -e "import('./packages/knowledge/dist/index.js').then(m => console.log(Object.keys(m).filter(k => k.includes('ikilink'))))"`

Expected: prints `[ 'extractWikilinks', 'resolveWikilinks' ]`.

- [ ] **Step 4: Commit**

```bash
git add packages/knowledge/src/index.ts packages/knowledge/dist
git commit -m "feat(knowledge): re-export wikilink helpers from package root"
```

---

## Phase 2 — `apps/api` `/api/knowledge` routes

### Task 4: Path-guard helper + `GET /api/knowledge/files`

**Files:**
- Modify: `apps/api/package.json` (add dep)
- Create: `apps/api/src/routes/knowledge.ts`
- Create: `apps/api/tests/routes/knowledge.test.ts`

- [ ] **Step 1: Add `@zeno/knowledge` to apps/api deps**

Edit `apps/api/package.json`, in the `"dependencies"` block, add (alphabetical between `@zeno/github-app` and `@zeno/logger`):
```json
"@zeno/knowledge": "workspace:*",
```

Run: `pnpm install`

Expected: lockfile updates, no install error.

- [ ] **Step 2: Write failing tests for `GET /api/knowledge/files`**

`apps/api/tests/routes/knowledge.test.ts`:
```ts
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
  it('returns empty array on empty knowledge dir', async () => {
    const res = await makeApp().request('/api/knowledge/files');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ files: [], totalBytes: 0, totalFiles: 0 });
  });

  it('returns flat list with title/bytes/mtime/tags', async () => {
    writeFileSync(join(knowledgeRoot, 'foo.md'), '---\ntitle: Foo\ntags: [a, b]\n---\nbody');
    mkdirSync(join(knowledgeRoot, 'processes'));
    writeFileSync(
      join(knowledgeRoot, 'processes', 'release-flow.md'),
      '# Release Flow\nsteps',
    );
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @zeno/api test knowledge`

Expected: FAIL with `Cannot find module '@/routes/knowledge'` OR `createApp does not accept knowledgeRoot` (depending on which error TS surfaces first). Both are expected — the route + AppDeps wiring don't exist yet.

- [ ] **Step 4: Create the route module**

`apps/api/src/routes/knowledge.ts`:
```ts
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import {
  extractTitle,
  extractWikilinks,
  parseFrontmatter,
  resolveWikilinks,
  scanKnowledge,
} from '@zeno/knowledge';
import { Hono } from 'hono';

export interface KnowledgeRouteDeps {
  knowledgeRoot: string;
}

interface FileSummary {
  path: string;
  title: string;
  bytes: number;
  mtime: string;
  tags: string[];
}

interface FilesResponse {
  files: FileSummary[];
  totalBytes: number;
  totalFiles: number;
}

interface FileResponse {
  path: string;
  content: string;
  frontmatter: Record<string, unknown> | null;
  title: string;
  mtime: string;
  bytes: number;
  wikilinks: Record<string, string | null>;
}

export function buildKnowledgeRoute(deps: KnowledgeRouteDeps): Hono {
  const route = new Hono();
  const { knowledgeRoot } = deps;

  route.get('/files', (c) => {
    const files = listFiles(knowledgeRoot);
    const totalBytes = files.reduce((sum, f) => sum + f.bytes, 0);
    const body: FilesResponse = { files, totalBytes, totalFiles: files.length };
    return c.json(body);
  });

  return route;
}

function listFiles(root: string): FileSummary[] {
  // Use the existing scanner — same as the worker — but expose ALL files
  // (including `_`-prefixed meta files). scanKnowledge filters those out, so
  // we do a parallel walk here. UI filters meta files client-side.
  if (!existsSync(root)) return [];
  const out: FileSummary[] = [];
  const entries = readdirSync(root, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.md')) continue;
    const abs = join(entry.parentPath, entry.name);
    const relParts = abs.slice(root.length).split(sep).filter(Boolean);
    const relPath = relParts.join('/');
    const stat = statSync(abs);
    const raw = readFileSync(abs, 'utf8');
    const { frontmatter, body } = parseFrontmatter(raw);
    out.push({
      path: relPath,
      title: extractTitle({ frontmatter, body, relPath }),
      bytes: stat.size,
      mtime: new Date(stat.mtimeMs).toISOString(),
      tags: frontmatter?.tags ?? [],
    });
  }
  out.sort((a, b) => a.path.toLowerCase().localeCompare(b.path.toLowerCase()));
  return out;
}

// extractWikilinks + resolveWikilinks + scanKnowledge re-export silences the
// "imported-but-unused" lint until /file is added in Task 5/6. They are used
// in Task 6.
void extractWikilinks;
void resolveWikilinks;
void scanKnowledge;
```

- [ ] **Step 5: Wire the route into `server.ts`**

Edit `apps/api/src/server.ts`:

a) Add to the `AppDeps` interface (after `profileDir`):
```ts
  /** Spec 2026-05-20-knowledge-browser-page: read-only root for /api/knowledge. */
  knowledgeRoot: string;
```

b) Add import near the top with other route imports:
```ts
import { buildKnowledgeRoute } from '@/routes/knowledge';
```

c) Add the mount line in `createApp` (place between `app.route('/api/logs', …)` and the `if (deps.connectorRepo)` block):
```ts
  app.route('/api/knowledge', buildKnowledgeRoute({ knowledgeRoot: deps.knowledgeRoot }));
```

- [ ] **Step 6: Wire `knowledgeRoot` into `apps/api/src/index.ts`**

Edit `apps/api/src/index.ts`:

a) Add after the existing `PROFILE_CANDIDATES` const:
```ts
const KNOWLEDGE_CANDIDATES = ['/app/knowledge', 'knowledge'];

function resolveKnowledgeDir(): string {
  for (const candidate of KNOWLEDGE_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  return KNOWLEDGE_CANDIDATES[KNOWLEDGE_CANDIDATES.length - 1] as string;
}
```

b) In `main()`, after `const profileDir = resolveProfileDir();` add:
```ts
  const knowledgeRoot = resolveKnowledgeDir();
```

c) In the `createApp({…})` call, add `knowledgeRoot,` alongside `profileDir,`.

- [ ] **Step 7: Patch existing route tests that build the app**

Run: `grep -l "createApp({" apps/api/tests`

For each test file the grep returns, locate the `createApp({` literal and add `knowledgeRoot: '/tmp',` alongside `profileDir`. List of files to patch (likely): `apps/api/tests/routes/health.test.ts`, `apps/api/tests/routes/activity.test.ts`, `apps/api/tests/routes/crons.test.ts`, and every other file under `apps/api/tests/routes/`.

After patching, run a sanity grep:
```bash
grep -c "knowledgeRoot:" apps/api/tests/routes/*.test.ts
```
Every file that builds an app must show `1` (or more) — none should show `0`. If a file shows `0`, add the field.

- [ ] **Step 8: Run the tests**

Run: `pnpm --filter @zeno/api test knowledge`

Expected: PASS — three describe-blocks for `/files`, all green.

Run: `pnpm --filter @zeno/api test`

Expected: PASS — full api test suite stays green; no other test broke from the `AppDeps` change.

- [ ] **Step 9: Commit**

```bash
git add apps/api/package.json apps/api/src/routes/knowledge.ts \
        apps/api/src/server.ts apps/api/src/index.ts \
        apps/api/tests/routes/knowledge.test.ts \
        apps/api/tests/routes pnpm-lock.yaml
git commit -m "feat(api): GET /api/knowledge/files + wire knowledgeRoot through AppDeps"
```

---

### Task 5: `GET /api/knowledge/file` — happy path

**Files:**
- Modify: `apps/api/src/routes/knowledge.ts`
- Modify: `apps/api/tests/routes/knowledge.test.ts`

- [ ] **Step 1: Append failing tests**

`apps/api/tests/routes/knowledge.test.ts` (append a new describe block):
```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @zeno/api test knowledge`

Expected: FAIL — first happy-path test returns 404 (route handler for `/file` not implemented).

- [ ] **Step 3: Implement `/file` handler**

Edit `apps/api/src/routes/knowledge.ts`. Replace the `void extractWikilinks; void resolveWikilinks; void scanKnowledge;` stub block with the handler. Inside `buildKnowledgeRoute`, AFTER the `/files` route, add:

```ts
  route.get('/file', (c) => {
    const requested = c.req.query('path');
    if (typeof requested !== 'string' || requested.length === 0) {
      return c.json({ error: 'invalid_path' as const }, 400);
    }
    const guarded = guardPath(knowledgeRoot, requested);
    if (guarded === null) {
      return c.json({ error: 'invalid_path' as const }, 400);
    }
    if (!existsSync(guarded)) {
      return c.json({ error: 'not_found' as const }, 404);
    }
    let raw: string;
    let stat: ReturnType<typeof statSync>;
    try {
      raw = readFileSync(guarded, 'utf8');
      stat = statSync(guarded);
    } catch (err) {
      return c.json({ error: 'read_failed' as const, detail: String(err) }, 500);
    }
    let parsed: ReturnType<typeof parseFrontmatter>;
    let frontmatterOut: Record<string, unknown> | null;
    let contentOut: string;
    try {
      parsed = parseFrontmatter(raw);
      frontmatterOut = parsed.frontmatter
        ? (parsed.frontmatter as unknown as Record<string, unknown>)
        : null;
      contentOut = parsed.body;
    } catch {
      // Malformed YAML — return the raw file as content, no frontmatter.
      parsed = { frontmatter: null, body: raw };
      frontmatterOut = null;
      contentOut = raw;
    }
    const allPaths = listFiles(knowledgeRoot).map((f) => f.path);
    const slugs = extractWikilinks(contentOut);
    const wikilinks = resolveWikilinks(slugs, allPaths);
    const title = extractTitle({
      frontmatter: parsed.frontmatter,
      body: parsed.body,
      relPath: requested,
    });
    const body: FileResponse = {
      path: requested,
      content: contentOut,
      frontmatter: frontmatterOut,
      title,
      bytes: stat.size,
      mtime: new Date(stat.mtimeMs).toISOString(),
      wikilinks,
    };
    return c.json(body);
  });
```

Also delete the trailing `void extractWikilinks; void resolveWikilinks; void scanKnowledge;` lines.

Add the `guardPath` helper at the bottom of the file:
```ts
function guardPath(root: string, requested: string): string | null {
  if (requested.startsWith('/')) return null;
  if (!requested.endsWith('.md')) return null;
  const abs = resolve(root, requested);
  // Ensure the resolved path is still under root (defeats `..` traversal).
  if (abs !== root && !abs.startsWith(root + sep)) return null;
  return abs;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @zeno/api test knowledge`

Expected: PASS — all four new happy-path assertions green; the `/files` tests from Task 4 still green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/knowledge.ts apps/api/tests/routes/knowledge.test.ts
git commit -m "feat(api): GET /api/knowledge/file returns content + wikilinks map"
```

---

### Task 6: `/api/knowledge/file` — error paths (path traversal, 404, non-md, absolute)

**Files:**
- Modify: `apps/api/tests/routes/knowledge.test.ts`

- [ ] **Step 1: Append the failing tests**

```ts
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
```

- [ ] **Step 2: Run tests**

Run: `pnpm --filter @zeno/api test knowledge`

Expected: PASS — the guard implemented in Task 5 already handles all six cases. If any fails, fix `guardPath` accordingly (e.g. tighten the resolve check or add a redundant `'..'`-segment check).

- [ ] **Step 3: Commit**

```bash
git add apps/api/tests/routes/knowledge.test.ts
git commit -m "test(api): /api/knowledge/file rejects traversal, absolute, non-md, missing"
```

---

### Task 7: Quality gate green across all workspaces

- [ ] **Step 1: Run the gate**

Run: `pnpm run quality-gate`

Expected: lint, typecheck, tests across `packages/knowledge`, `apps/api`, and all other workspaces green. Fix any issue caused by the new dep (most likely candidate: a missing `knowledgeRoot` in a test still on the legacy `createApp` shape — patch and re-run).

- [ ] **Step 2: Commit any patches surfaced by the gate**

```bash
git add -A
git commit -m "chore: pacify quality gate after knowledge route wiring"
```

(Skip the commit if the gate was clean — `git status` will show no diff.)

---

## Phase 3 — `apps/dashboard` UI

### Task 8: Capture pre-feature bundle baseline

- [ ] **Step 1: Build the dashboard**

Run: `pnpm --filter @zeno/dashboard build`

Expected: vite reports bundle sizes by chunk. Capture the total gzipped size from the output.

- [ ] **Step 2: Save the baseline number to scratch**

Write the gzipped total to `tmp/dashboard-bundle-baseline.txt` (path conforms to `[[../../rules/generated-files-location|rules/generated-files-location]]`). Example:
```bash
echo "before: 312 KB gz" > tmp/dashboard-bundle-baseline.txt
```

Do NOT commit `tmp/`.

---

### Task 9: Add `react-markdown` + `remark-gfm`

**Files:**
- Modify: `apps/dashboard/package.json`

- [ ] **Step 1: Add deps**

Edit `apps/dashboard/package.json`. In the `"dependencies"` block, add (preserving alphabetical):
```json
"react-markdown": "^9.1.0",
"remark-gfm": "^4.0.0",
```

- [ ] **Step 2: Install**

Run: `pnpm install`

Expected: lockfile updates; no peer warning that would block typecheck.

- [ ] **Step 3: Sanity import**

Run: `node -e "import('react-markdown').then(m => console.log(typeof m.default)); import('remark-gfm').then(m => console.log(typeof m.default))"`

Expected: prints `function` twice.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/package.json pnpm-lock.yaml
git commit -m "feat(dashboard): add react-markdown + remark-gfm for knowledge viewer"
```

---

### Task 10: `useKnowledgeFiles` + `useKnowledgeFile` hooks

**Files:**
- Create: `apps/dashboard/src/lib/use-knowledge.ts`

- [ ] **Step 1: Write the file**

```ts
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export interface KnowledgeFileSummary {
  path: string;
  title: string;
  bytes: number;
  mtime: string;
  tags: string[];
}

export interface KnowledgeFilesResponse {
  files: KnowledgeFileSummary[];
  totalBytes: number;
  totalFiles: number;
}

export interface KnowledgeFileResponse {
  path: string;
  content: string;
  frontmatter: Record<string, unknown> | null;
  title: string;
  bytes: number;
  mtime: string;
  wikilinks: Record<string, string | null>;
}

export function useKnowledgeFiles() {
  return useQuery({
    queryKey: ['knowledge', 'files'],
    queryFn: () => apiFetch<KnowledgeFilesResponse>('/api/knowledge/files'),
    staleTime: 30_000,
  });
}

export function useKnowledgeFile(path: string | undefined) {
  return useQuery({
    queryKey: ['knowledge', 'file', path ?? null],
    queryFn: () =>
      apiFetch<KnowledgeFileResponse>(
        `/api/knowledge/file?path=${encodeURIComponent(path ?? '')}`,
      ),
    enabled: typeof path === 'string' && path.length > 0,
    staleTime: 0,
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @zeno/dashboard typecheck`

Expected: clean — no implicit-any, no missing import.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/lib/use-knowledge.ts
git commit -m "feat(dashboard): use-knowledge hooks for /api/knowledge/{files,file}"
```

---

### Task 11: Tree component

**Files:**
- Create: `apps/dashboard/src/components/knowledge/tree.tsx`
- Create: `apps/dashboard/tests/components/knowledge/tree.test.tsx`

- [ ] **Step 1: Write failing tests**

`apps/dashboard/tests/components/knowledge/tree.test.tsx`:
```tsx
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KnowledgeTree } from '@/components/knowledge/tree';

afterEach(cleanup);

const files = [
  { path: 'foo.md', title: 'Foo', bytes: 10, mtime: '', tags: [] },
  {
    path: 'processes/release-flow.md',
    title: 'Release Flow',
    bytes: 20,
    mtime: '',
    tags: [],
  },
  { path: '_index.md', title: 'index', bytes: 5, mtime: '', tags: [] },
];

describe('<KnowledgeTree>', () => {
  it('renders root files and nested folders', () => {
    render(
      <KnowledgeTree files={files} selectedPath={undefined} showMeta={false} onSelect={() => {}} />,
    );
    expect(screen.getByText('foo.md')).toBeTruthy();
    expect(screen.getByText('processes')).toBeTruthy();
  });

  it('hides _-prefixed files when showMeta is false', () => {
    render(
      <KnowledgeTree files={files} selectedPath={undefined} showMeta={false} onSelect={() => {}} />,
    );
    expect(screen.queryByText('_index.md')).toBeNull();
  });

  it('reveals _-prefixed files when showMeta is true', () => {
    render(
      <KnowledgeTree files={files} selectedPath={undefined} showMeta={true} onSelect={() => {}} />,
    );
    expect(screen.getByText('_index.md')).toBeTruthy();
  });

  it('auto-expands ancestors of selected path', () => {
    render(
      <KnowledgeTree
        files={files}
        selectedPath="processes/release-flow.md"
        showMeta={false}
        onSelect={() => {}}
      />,
    );
    // release-flow.md is inside processes/, so it must be visible without
    // a manual click — auto-expansion handled it.
    expect(screen.getByText('release-flow.md')).toBeTruthy();
  });

  it('calls onSelect with file path when a file is clicked', () => {
    const onSelect = vi.fn();
    render(
      <KnowledgeTree files={files} selectedPath={undefined} showMeta={false} onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByText('foo.md'));
    expect(onSelect).toHaveBeenCalledWith('foo.md');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @zeno/dashboard test tree`

Expected: FAIL with `Cannot find module '@/components/knowledge/tree'`.

- [ ] **Step 3: Implement the tree**

`apps/dashboard/src/components/knowledge/tree.tsx`:
```tsx
import type { JSX } from 'react';
import { useMemo, useState } from 'react';
import type { KnowledgeFileSummary } from '@/lib/use-knowledge';

interface Props {
  files: KnowledgeFileSummary[];
  selectedPath: string | undefined;
  showMeta: boolean;
  onSelect: (path: string) => void;
}

interface FolderNode {
  type: 'folder';
  name: string;
  children: TreeNode[];
}
interface FileNode {
  type: 'file';
  name: string;
  path: string;
}
type TreeNode = FolderNode | FileNode;

export function KnowledgeTree({ files, selectedPath, showMeta, onSelect }: Props): JSX.Element {
  const visible = useMemo(
    () => files.filter((f) => showMeta || !pathHasMeta(f.path)),
    [files, showMeta],
  );
  const tree = useMemo(() => buildTree(visible), [visible]);
  const expanded = useExpanded(tree, selectedPath);

  return (
    <nav className="flex flex-col gap-0.5 font-mono text-[13px]">
      {tree.map((node) => (
        <NodeView
          key={nodeKey(node, '')}
          node={node}
          parentPath=""
          depth={0}
          expanded={expanded}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      ))}
    </nav>
  );
}

function NodeView(props: {
  node: TreeNode;
  parentPath: string;
  depth: number;
  expanded: Set<string>;
  selectedPath: string | undefined;
  onSelect: (path: string) => void;
}): JSX.Element {
  const { node, parentPath, depth, expanded, selectedPath, onSelect } = props;
  const fullPath = parentPath === '' ? node.name : `${parentPath}/${node.name}`;
  if (node.type === 'file') {
    const isSelected = selectedPath === node.path;
    return (
      <button
        type="button"
        onClick={() => onSelect(node.path)}
        className={`text-left px-2 py-1 rounded hover:bg-gold-soft ${
          isSelected ? 'bg-gold-soft text-text-primary' : 'text-text-secondary'
        }`}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        {node.name}
      </button>
    );
  }
  const isOpen = expanded.has(fullPath);
  return (
    <div className="flex flex-col">
      <div
        className="px-2 py-1 text-text-tertiary uppercase tracking-wide text-[11px]"
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        {node.name}
      </div>
      {isOpen
        ? node.children.map((child) => (
            <NodeView
              key={nodeKey(child, fullPath)}
              node={child}
              parentPath={fullPath}
              depth={depth + 1}
              expanded={expanded}
              selectedPath={selectedPath}
              onSelect={onSelect}
            />
          ))
        : null}
    </div>
  );
}

function nodeKey(node: TreeNode, parentPath: string): string {
  return parentPath === '' ? node.name : `${parentPath}/${node.name}`;
}

function pathHasMeta(p: string): boolean {
  return p.split('/').some((seg) => seg.startsWith('_'));
}

function buildTree(files: KnowledgeFileSummary[]): TreeNode[] {
  const root: FolderNode = { type: 'folder', name: '', children: [] };
  for (const file of files) {
    const parts = file.path.split('/');
    let cursor: FolderNode = root;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const folderName = parts[i] as string;
      let next = cursor.children.find(
        (c): c is FolderNode => c.type === 'folder' && c.name === folderName,
      );
      if (!next) {
        next = { type: 'folder', name: folderName, children: [] };
        cursor.children.push(next);
      }
      cursor = next;
    }
    const leaf = parts[parts.length - 1] as string;
    cursor.children.push({ type: 'file', name: leaf, path: file.path });
  }
  sortRecursive(root);
  return root.children;
}

function sortRecursive(node: FolderNode): void {
  node.children.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const child of node.children) {
    if (child.type === 'folder') sortRecursive(child);
  }
}

function useExpanded(_tree: TreeNode[], selectedPath: string | undefined): Set<string> {
  const ancestors = useMemo(() => {
    if (typeof selectedPath !== 'string') return new Set<string>();
    const parts = selectedPath.split('/').slice(0, -1);
    const out = new Set<string>();
    let acc = '';
    for (const part of parts) {
      acc = acc === '' ? part : `${acc}/${part}`;
      out.add(acc);
    }
    return out;
  }, [selectedPath]);
  // Manual expansion (clicking folder rows) is out of v1 scope — auto-expand
  // by selectedPath covers the only navigation entry point.
  // If future iteration adds manual expand, lift state via useState here.
  const [manual] = useState<Set<string>>(new Set());
  return useMemo(() => new Set([...ancestors, ...manual]), [ancestors, manual]);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @zeno/dashboard test tree`

Expected: PASS — all five assertions green.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/components/knowledge/tree.tsx \
        apps/dashboard/tests/components/knowledge/tree.test.tsx
git commit -m "feat(dashboard): KnowledgeTree component with auto-expand + meta filter"
```

---

### Task 12: Wikilink remark plugin

**Files:**
- Create: `apps/dashboard/src/components/knowledge/wikilink-plugin.ts`

- [ ] **Step 1: Implement the plugin**

```ts
import type { Root, Text } from 'mdast';
import type { Plugin } from 'unified';
import { visit, SKIP } from 'unist-util-visit';

const WIKILINK_RE = /\[\[([^\[\]]+?)\]\]/g;

/**
 * Transforms `[[slug]]` tokens in text nodes into either a link node (when
 * the slug resolves to a known file via the `wikilinks` map) or a
 * `data: { hName: 'span', hProperties: { 'data-broken': 'true', ... } }`
 * styled span (when the slug is unresolved or ambiguous).
 *
 * The map is passed at compile time (per file) so the plugin has no side
 * effects and remains pure.
 */
export const wikilinkPlugin: Plugin<[{ wikilinks: Record<string, string | null> }], Root> = ({
  wikilinks,
}) => {
  return (tree) => {
    visit(tree, 'text', (node: Text, index, parent) => {
      if (parent === null || index === undefined) return;
      if (typeof node.value !== 'string') return;
      const value = node.value;
      if (!value.includes('[[')) return;
      const newChildren: Array<Text | LinkOrBroken> = [];
      let lastEnd = 0;
      let match: RegExpExecArray | null = WIKILINK_RE.exec(value);
      let matched = false;
      while (match !== null) {
        matched = true;
        const slug = match[1] as string;
        if (match.index > lastEnd) {
          newChildren.push({ type: 'text', value: value.slice(lastEnd, match.index) });
        }
        const resolved = wikilinks[slug];
        if (typeof resolved === 'string') {
          newChildren.push({
            type: 'link',
            url: `?file=${encodeURIComponent(resolved)}`,
            title: null,
            children: [{ type: 'text', value: slug }],
            data: { hProperties: { 'data-wikilink': slug } },
          });
        } else {
          newChildren.push({
            type: 'text',
            value: slug,
            data: {
              hName: 'span',
              hProperties: {
                'data-broken': 'true',
                title: `wikilink not found: ${slug}`,
                className: 'wikilink-broken',
              },
            },
          });
        }
        lastEnd = match.index + match[0].length;
        match = WIKILINK_RE.exec(value);
      }
      if (!matched) return;
      if (lastEnd < value.length) {
        newChildren.push({ type: 'text', value: value.slice(lastEnd) });
      }
      WIKILINK_RE.lastIndex = 0;
      parent.children.splice(index, 1, ...(newChildren as Text[]));
      return [SKIP, index + newChildren.length];
    });
  };
};

type LinkOrBroken = {
  type: string;
  [k: string]: unknown;
};
```

- [ ] **Step 2: Verify imports + types**

Run: `pnpm --filter @zeno/dashboard typecheck`

Expected: clean. If `mdast`/`unified`/`unist-util-visit` types are missing, add as devDeps:
```bash
pnpm --filter @zeno/dashboard add -D @types/mdast unified unist-util-visit
```
Then re-typecheck.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/components/knowledge/wikilink-plugin.ts \
        apps/dashboard/package.json pnpm-lock.yaml
git commit -m "feat(dashboard): remark plugin transforms [[slug]] to link or broken span"
```

---

### Task 13: Viewer component

**Files:**
- Create: `apps/dashboard/src/components/knowledge/viewer.tsx`
- Create: `apps/dashboard/src/components/knowledge/empty-state.tsx`
- Create: `apps/dashboard/tests/components/knowledge/viewer.test.tsx`

- [ ] **Step 1: Failing tests**

`apps/dashboard/tests/components/knowledge/viewer.test.tsx`:
```tsx
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, search }: { children: React.ReactNode; search: unknown }) => (
    <a data-mock-link href={typeof search === 'object' ? JSON.stringify(search) : ''}>
      {children}
    </a>
  ),
}));

import { KnowledgeViewer } from '@/components/knowledge/viewer';

afterEach(cleanup);

describe('<KnowledgeViewer>', () => {
  it('renders empty state when no file', () => {
    render(<KnowledgeViewer file={null} />);
    expect(screen.getByText(/knowledge/i)).toBeTruthy();
  });

  it('renders markdown for a loaded file', () => {
    render(
      <KnowledgeViewer
        file={{
          path: 'foo.md',
          content: '# Title\n\n- one\n- two',
          frontmatter: null,
          title: 'Title',
          bytes: 12,
          mtime: '2026-05-20T10:00:00Z',
          wikilinks: {},
        }}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Title' })).toBeTruthy();
    expect(screen.getByText('one')).toBeTruthy();
  });

  it('renders a resolved wikilink as a link', () => {
    render(
      <KnowledgeViewer
        file={{
          path: 'foo.md',
          content: 'see [[bar]] now',
          frontmatter: null,
          title: 'foo',
          bytes: 20,
          mtime: '2026-05-20T10:00:00Z',
          wikilinks: { bar: 'bar.md' },
        }}
      />,
    );
    const anchor = screen.getByText('bar').closest('a');
    expect(anchor).not.toBeNull();
    expect(anchor?.getAttribute('href') ?? '').toContain('bar.md');
  });

  it('renders an unresolved wikilink as a broken span', () => {
    render(
      <KnowledgeViewer
        file={{
          path: 'foo.md',
          content: 'see [[ghost]] now',
          frontmatter: null,
          title: 'foo',
          bytes: 20,
          mtime: '2026-05-20T10:00:00Z',
          wikilinks: { ghost: null },
        }}
      />,
    );
    const broken = document.querySelector('[data-broken="true"]');
    expect(broken).not.toBeNull();
    expect(broken?.getAttribute('title')).toBe('wikilink not found: ghost');
  });

  it('shows frontmatter-invalid warning when frontmatter is null and content starts with ---', () => {
    render(
      <KnowledgeViewer
        file={{
          path: 'foo.md',
          content: '---\ntitle: "unclosed\n---\nbody',
          frontmatter: null,
          title: 'foo.md',
          bytes: 30,
          mtime: '2026-05-20T10:00:00Z',
          wikilinks: {},
        }}
      />,
    );
    expect(screen.getByText(/frontmatter invalid/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @zeno/dashboard test viewer`

Expected: FAIL with `Cannot find module '@/components/knowledge/viewer'`.

- [ ] **Step 3: Implement the empty state**

`apps/dashboard/src/components/knowledge/empty-state.tsx`:
```tsx
import type { JSX } from 'react';

export function KnowledgeEmptyState(): JSX.Element {
  return (
    <div className="flex flex-col items-start gap-3 p-6 text-text-secondary">
      <p className="font-sans text-sm">
        Select a file from the left to view it here.
      </p>
      <p className="font-mono text-[12px] text-text-tertiary">
        Knowledge lives under <code>~/.zeno/profiles/&lt;name&gt;/knowledge/</code>. Edit notes in
        your editor; the dashboard surfaces them read-only.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Implement the viewer**

`apps/dashboard/src/components/knowledge/viewer.tsx`:
```tsx
import type { JSX } from 'react';
import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { wikilinkPlugin } from '@/components/knowledge/wikilink-plugin';
import { KnowledgeEmptyState } from '@/components/knowledge/empty-state';
import type { KnowledgeFileResponse } from '@/lib/use-knowledge';

interface Props {
  file: KnowledgeFileResponse | null;
}

export function KnowledgeViewer({ file }: Props): JSX.Element {
  if (file === null) {
    return <KnowledgeEmptyState />;
  }
  const plugins = useMemo(() => [remarkGfm, [wikilinkPlugin, { wikilinks: file.wikilinks }]], [file.wikilinks]);
  const frontmatterBroken = file.frontmatter === null && file.content.startsWith('---');
  return (
    <article className="flex flex-col gap-4">
      <header className="border-b border-border-subtle pb-3 flex flex-col gap-2">
        <Breadcrumb path={file.path} />
        <div className="font-mono text-[11px] text-text-tertiary flex gap-3">
          <span>{formatBytes(file.bytes)}</span>
          <span>·</span>
          <span>edited {formatRelativeTime(file.mtime)}</span>
          {Array.isArray(file.frontmatter?.tags) && file.frontmatter.tags.length > 0 ? (
            <>
              <span>·</span>
              <span>{(file.frontmatter.tags as string[]).map((t) => `#${t}`).join(' ')}</span>
            </>
          ) : null}
        </div>
        {frontmatterBroken ? (
          <div className="font-mono text-[11px] text-status-failed">frontmatter invalid</div>
        ) : null}
      </header>
      <div className="prose prose-invert max-w-none font-sans text-sm leading-[1.6]">
        <ReactMarkdown remarkPlugins={plugins}>{file.content}</ReactMarkdown>
      </div>
    </article>
  );
}

function Breadcrumb({ path }: { path: string }): JSX.Element {
  const parts = path.split('/');
  return (
    <h2 className="font-mono text-[13px] text-text-primary m-0">
      {parts.map((part, idx) => (
        <span key={`${part}-${idx}`}>
          {idx > 0 ? <span className="text-text-tertiary"> / </span> : null}
          <span>{part}</span>
        </span>
      ))}
    </h2>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const deltaMs = Date.now() - then;
  const minutes = Math.round(deltaMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @zeno/dashboard test viewer`

Expected: PASS — all five assertions green.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/components/knowledge \
        apps/dashboard/tests/components/knowledge/viewer.test.tsx
git commit -m "feat(dashboard): KnowledgeViewer renders markdown + wikilinks + meta header"
```

---

### Task 14: `/knowledge` route + sidebar nav

**Files:**
- Create: `apps/dashboard/src/routes/_authed/knowledge.tsx`
- Modify: `apps/dashboard/src/components/layout/dashboard-sidebar.tsx`

- [ ] **Step 1: Create the route**

`apps/dashboard/src/routes/_authed/knowledge.tsx`:
```tsx
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { type JSX, useCallback, useEffect, useState } from 'react';
import { KnowledgeTree } from '@/components/knowledge/tree';
import { KnowledgeViewer } from '@/components/knowledge/viewer';
import { DashboardTopstrip } from '@/components/layout/dashboard-topstrip';
import { useKnowledgeFile, useKnowledgeFiles } from '@/lib/use-knowledge';

interface KnowledgeSearch {
  file?: string;
}

const SHOW_META_KEY = 'zeno.knowledge.showMeta';

export const Route = createFileRoute('/_authed/knowledge')({
  validateSearch: (search: Record<string, unknown>): KnowledgeSearch => ({
    file: typeof search.file === 'string' ? search.file : undefined,
  }),
  component: KnowledgeScreen,
});

function KnowledgeScreen(): JSX.Element {
  const { file: filePath } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const filesQuery = useKnowledgeFiles();
  const fileQuery = useKnowledgeFile(filePath);
  const [showMeta, setShowMeta] = useShowMeta();

  const onSelect = useCallback(
    (path: string) => {
      navigate({ search: { file: path } });
    },
    [navigate],
  );

  const onToggleMeta = useCallback(() => {
    setShowMeta((v) => !v);
  }, [setShowMeta]);

  return (
    <>
      <DashboardTopstrip crumbs={[{ label: 'knowledge', current: true }]} />
      <div className="flex gap-6 px-8 pt-8 pb-12 min-w-0">
        <aside className="w-[280px] shrink-0 flex flex-col gap-3 border-r border-border-subtle pr-4">
          <label className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wide text-text-tertiary cursor-pointer">
            <input
              type="checkbox"
              checked={showMeta}
              onChange={onToggleMeta}
              className="accent-gold"
            />
            show meta files
          </label>
          {filesQuery.isLoading ? (
            <div className="text-text-tertiary text-sm">loading...</div>
          ) : (
            <KnowledgeTree
              files={filesQuery.data?.files ?? []}
              selectedPath={filePath}
              showMeta={showMeta}
              onSelect={onSelect}
            />
          )}
        </aside>
        <main className="flex-1 min-w-0">
          {fileQuery.isError ? (
            <FileMissing onClear={() => navigate({ search: {} })} />
          ) : (
            <KnowledgeViewer file={fileQuery.data ?? null} />
          )}
        </main>
      </div>
    </>
  );
}

function FileMissing({ onClear }: { onClear: () => void }): JSX.Element {
  return (
    <div className="flex flex-col gap-3 p-6 text-text-secondary">
      <p>File not found.</p>
      <button
        type="button"
        className="text-gold underline self-start"
        onClick={onClear}
      >
        Clear selection
      </button>
    </div>
  );
}

function useShowMeta(): [boolean, (updater: (prev: boolean) => boolean) => void] {
  const [value, setValue] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(SHOW_META_KEY) === 'true';
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SHOW_META_KEY, value ? 'true' : 'false');
  }, [value]);
  return [value, setValue];
}
```

- [ ] **Step 2: Add the sidebar nav item**

Edit `apps/dashboard/src/components/layout/dashboard-sidebar.tsx`:

a) Update the `NavId` union type:
```ts
type NavId = 'home' | 'backend' | 'crons' | 'channels' | 'connectors' | 'knowledge' | 'skills' | 'settings';
```

b) Insert in the `NAV` array between the `connectors` and `skills` entries:
```ts
  { id: 'knowledge', label: 'knowledge', to: '/knowledge' },
```

c) Add a branch to `navIdForPath`:
```ts
  if (path.startsWith('/knowledge')) return 'knowledge';
```

- [ ] **Step 3: Run typecheck + tests**

Run: `pnpm --filter @zeno/dashboard typecheck && pnpm --filter @zeno/dashboard test`

Expected: clean. If `sidebar.test.tsx` asserts a specific NAV length or labels list, update it to include `'knowledge'`.

- [ ] **Step 4: Build the dashboard and measure the bundle delta**

Run: `pnpm --filter @zeno/dashboard build`

Compare the gzipped total with `tmp/dashboard-bundle-baseline.txt`. Expected: delta ≤ 80 KB gzipped.

If delta > 80 KB:
- Verify `react-markdown` is the dominant contribution via the vite output.
- Confirm no rehype/sanitize plugin was added by accident.
- If still over, surface to the user — do NOT silently exceed the AC.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/routes/_authed/knowledge.tsx \
        apps/dashboard/src/components/layout/dashboard-sidebar.tsx \
        apps/dashboard/tests/components/sidebar.test.tsx
git commit -m "feat(dashboard): /knowledge route + sidebar nav item"
```

---

### Task 15: Full quality gate green across workspaces

- [ ] **Step 1: Run the gate**

Run: `pnpm run quality-gate`

Expected: lint + typecheck + tests for `packages/knowledge`, `apps/api`, `apps/dashboard`, and every other workspace pass. Fix any cross-workspace breakage.

- [ ] **Step 2: Commit any patches**

```bash
git add -A
git commit -m "chore: pacify quality gate after knowledge browser wiring"
```

(Skip if `git status` is clean.)

---

## Phase 4 — E2E verification

### Task 16: Manual E2E in the running container

- [ ] **Step 1: Rebuild and restart the local profile**

Run: `zeno restart fn --build`

(Use whichever profile is configured for testing — `fn` is the maintainer's default per existing project context.)

Expected: container boots; `zeno logs fn --tail 50` shows `api_listening`.

- [ ] **Step 2: Seed canary files in the knowledge folder**

```bash
PROFILE_KN=~/.zeno/profiles/fn/knowledge
echo -e '---\ntitle: Browser Canary A\ntags: [browser-canary]\n---\nSee [[browser-canary-b]] for the other half. Broken link: [[browser-canary-nope]].' > "$PROFILE_KN/browser-canary-a.md"
echo -e '---\ntitle: Browser Canary B\n---\n# Browser Canary B\n\nReturn to [[browser-canary-a]].' > "$PROFILE_KN/browser-canary-b.md"
```

- [ ] **Step 3: Open the dashboard in a browser**

Run: `zeno open fn` (or the equivalent for the test profile).

- [ ] **Step 4: Walk the acceptance checks**

Visit `/knowledge`. Verify in order:

1. Sidebar shows "knowledge" entry between connectors and skills.
2. Tree shows `browser-canary-a.md` + `browser-canary-b.md`; does NOT show `_index.md` or `_template.md` (toggle off).
3. Click `browser-canary-a.md`. URL becomes `/knowledge?file=browser-canary-a.md`. Viewer shows the body; header shows breadcrumb, bytes, edited-time, `#browser-canary` tag chip.
4. Click `[[browser-canary-b]]` link in the body. URL becomes `/knowledge?file=browser-canary-b.md`. Viewer swaps. Tree highlight moves.
5. Hover `[[browser-canary-nope]]` (back-navigate via browser Back). Confirm tooltip "wikilink not found: browser-canary-nope" and the span has `data-broken="true"` (via DevTools).
6. Toggle "show meta files". `_index.md` and `_template.md` appear. Toggle off — they disappear. Reload the page — toggle state preserved.
7. Edit `browser-canary-a.md` externally (change the body in `$EDITOR`). Switch back to the dashboard tab. Within ~1 sec the viewer should reflect the change (window-focus refetch).
8. Visit `/knowledge?file=does-not-exist.md`. Viewer shows "File not found" + "Clear selection".
9. Visit `/knowledge?file=../../etc/passwd`. Devtools Network shows 400 for `/api/knowledge/file` request; viewer shows "File not found".

If any check fails: fix root cause, re-run tests, re-build, re-verify the failing step. Do NOT proceed to step 5 until every check is green.

- [ ] **Step 5: Clean up canary files**

```bash
rm ~/.zeno/profiles/fn/knowledge/browser-canary-a.md
rm ~/.zeno/profiles/fn/knowledge/browser-canary-b.md
```

(Do not commit canaries — they are not part of the deliverable.)

- [ ] **Step 6: Capture proof for the PR**

Take 2-3 screenshots (tree+viewer, wikilink hover, frontmatter-broken state). Save to `tmp/knowledge-browser-e2e-*.png`. Reference them in the PR body when opening.

(`tmp/` is gitignored per `[[../../rules/generated-files-location|rules/generated-files-location]]`.)

---

## Self-Review

**1. Spec coverage:**

| Spec AC | Task |
|---|---|
| `GET /files` returns the documented shape | Task 4 |
| `GET /file` returns the documented shape | Task 5 |
| Traversal → 400 | Task 6 |
| Non-md → 400 | Task 6 |
| Absolute → 400 | Task 6 |
| Missing file → 404 | Task 6 |
| Malformed YAML → 200 + null frontmatter | Task 5 |
| Sidebar lists "knowledge" | Task 14 step 2 |
| Empty state copy mentions host path | Task 13 step 3 |
| Tree auto-expanded + highlighted on `?file=` | Task 11 + Task 14 |
| Resolved wikilink → `<a>` w/ `?file=…` | Task 12 + Task 13 |
| Broken wikilink → `<span data-broken="true">` w/ tooltip | Task 12 + Task 13 |
| Meta files hidden by default | Task 11 + Task 14 |
| Toggle persists in localStorage | Task 14 |
| Edit + focus → viewer updates within one render cycle | Task 10 (`staleTime: 0` + react-query default focus refetch) + Task 16 manual verification |
| Quality gate green | Task 7 + Task 15 |
| Bundle delta ≤ 80 KB gz | Task 8 baseline + Task 14 step 4 |

No gaps.

**2. Placeholder scan:** searched for `TBD`, `TODO`, `implement later`, `fill in details`, "appropriate error handling", "Similar to Task". None found.

**3. Type consistency:** `KnowledgeFileSummary` (Task 10) is the single source of truth for the row shape consumed by `KnowledgeTree` (Task 11). `KnowledgeFileResponse` (Task 10) matches the server response shape returned in Task 5. `wikilinks: Record<string, string | null>` is the same shape across server (Task 5), hook (Task 10), and plugin (Task 12).

---

## Execution decision

16 tasks across 3 source workspaces + an E2E phase. This is **subagent-driven** territory — dispatch a fresh subagent per task, review between tasks, and run the gate at each phase boundary.

**REQUIRED SUB-SKILL:** Use `superpowers:subagent-driven-development`.

Branch: `feat/91-knowledge-browser-page` (matches the project's `type/short-name` convention).
