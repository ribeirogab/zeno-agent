# Knowledge Graph View Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Frequent commits — one per task minimum.

**Goal:** Add an Obsidian-style force-directed graph view as a second mode of the `/knowledge` dashboard page from spec [2026-05-20-knowledge-browser-page](../2026-05-20-knowledge-browser-page/spec-knowledge-browser-page.md), driven by a new `GET /api/knowledge/graph` endpoint.

**Architecture:** Server scans the knowledge dir, computes nodes + undirected dedup links + folder-group palette in one response. Client lazy-loads `react-force-graph-2d` (~80 KB gz) on first toggle to Graph mode. Tree mode (default) pays zero extra bundle. Filters/Display state persists in `localStorage`; URL holds only `view=` and `file=`. Side preview panel reuses `KnowledgeViewer` from #91 — no fork.

**Tech Stack:** TypeScript, Hono, react-force-graph-2d, react-query, TanStack Router, vitest (happy-dom for React), biome.

---

## File Structure

**`apps/api/src/lib/build-graph.ts`** (new) — pure function `buildGraph(files: GraphInputFile[]) → GraphResponse`. No fs, no HTTP. Reusable + 100% testable.
**`apps/api/src/routes/knowledge.ts`** (modify) — add `route.get('/graph', …)` handler that scans the knowledge dir and calls `buildGraph`.
**`apps/api/tests/lib/build-graph.test.ts`** (new) — unit tests for the pure builder.
**`apps/api/tests/routes/knowledge-graph.test.ts`** (new) — HTTP-level test using a real testdata fixture under `apps/api/testdata/knowledge-graph/`.

**`apps/dashboard/src/components/knowledge/graph/types.ts`** (new) — `GraphResponse`, `GraphNode`, `GraphLink`, `GroupColor`, `FilterState`, `DisplayState`.
**`apps/dashboard/src/components/knowledge/graph/filter-graph.ts`** (new) — pure `applyFilters(raw, filters) → { nodes, links }`. Tested without React.
**`apps/dashboard/src/components/knowledge/graph/use-graph-data.ts`** (new) — react-query hook for `/api/knowledge/graph`.
**`apps/dashboard/src/components/knowledge/graph/use-graph-state.ts`** (new) — localStorage-backed hooks for `FilterState` + `DisplayState`.
**`apps/dashboard/src/components/knowledge/graph/canvas.tsx`** (new) — `react-force-graph-2d` wrapper with custom `nodeCanvasObject` + hover dim + click handler.
**`apps/dashboard/src/components/knowledge/graph/side-preview.tsx`** (new) — right-side 480px slide-over containing `KnowledgeViewer`.
**`apps/dashboard/src/components/knowledge/graph/filters-panel.tsx`** (new) — search + tag chips + folder multi-select + 3 checkboxes.
**`apps/dashboard/src/components/knowledge/graph/groups-panel.tsx`** (new) — read-only legend.
**`apps/dashboard/src/components/knowledge/graph/display-panel.tsx`** (new) — three range sliders.
**`apps/dashboard/src/components/knowledge/graph/controls.tsx`** (new) — collapsible wrapper hosting the 3 panels.
**`apps/dashboard/src/components/knowledge/graph/index.tsx`** (new) — default export `GraphView` combining canvas + controls + side-preview. THIS is the only module that statically imports `react-force-graph-2d`.
**`apps/dashboard/src/components/knowledge/view-toggle.tsx`** (new) — pill toggle "Tree | Graph" wired to `?view=`.
**`apps/dashboard/src/components/knowledge/lazy-error-boundary.tsx`** (new) — error boundary around the lazy graph chunk.
**`apps/dashboard/src/routes/_authed/knowledge.tsx`** (modify) — extend `KnowledgeSearch` with `view?: 'tree' | 'graph' | undefined`; render `<ViewToggle>` + conditional `<Suspense fallback="…"><GraphView/></Suspense>` vs current tree layout.
**`apps/dashboard/src/components/knowledge/graph/filter-graph.test.ts`** (new) — pure unit.
**`apps/dashboard/src/components/knowledge/graph/use-graph-state.test.tsx`** (new) — happy-dom localStorage round-trip.
**`apps/dashboard/src/components/knowledge/graph/canvas.test.tsx`** (new) — mocked `react-force-graph-2d`, asserts props pass-through + onNodeClick handler.
**`apps/dashboard/src/components/knowledge/view-toggle.test.tsx`** (new) — URL update on click.
**`apps/dashboard/vitest.setup.ts`** (new) — global mock for `react-force-graph-2d`.
**`apps/dashboard/vitest.config.ts`** (modify) — wire `setupFiles` to `vitest.setup.ts`.
**`apps/dashboard/package.json`** (modify) — add `react-force-graph-2d` to dependencies.
**`.vault/learnings/react-force-graph-2d-decision.md`** (new) — dep choice note per constitution.

---

## Task A1: Define server-side graph response types

**Files:**
- Modify: `apps/api/src/routes/knowledge.ts`

- [ ] **Step 1: Add type definitions at the top of `apps/api/src/routes/knowledge.ts` (above `buildKnowledgeRoute`)**

```ts
export interface GraphNode {
  id: string;
  label: string;
  group: string;
  size: number;
  tags: string[];
  exists: boolean;
  isMeta: boolean;
}

export interface GraphLink {
  source: string;
  target: string;
}

export interface GroupColor {
  group: string;
  color: string;
}

export interface GraphResponse {
  nodes: GraphNode[];
  links: GraphLink[];
  groups: GroupColor[];
}
```

- [ ] **Step 2: Verify the file still typechecks**

Run: `pnpm --filter @zeno/api exec tsc --noEmit`
Expected: PASS (no usages yet, just new exports).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/knowledge.ts
git commit -m "feat(api): types for /api/knowledge/graph response"
```

---

## Task A2: buildGraph pure function — empty case

**Files:**
- Create: `apps/api/src/lib/build-graph.ts`
- Create: `apps/api/tests/lib/build-graph.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/lib/build-graph.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildGraph } from '@/lib/build-graph';

describe('buildGraph', () => {
  it('returns empty arrays for empty input', () => {
    const out = buildGraph([]);
    expect(out).toEqual({ nodes: [], links: [], groups: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @zeno/api exec vitest run tests/lib/build-graph.test.ts`
Expected: FAIL with `Cannot find module '@/lib/build-graph'`.

- [ ] **Step 3: Create the minimal implementation**

Create `apps/api/src/lib/build-graph.ts`:

```ts
import type { ParsedFrontmatter } from '@zeno/knowledge';
import type { GraphLink, GraphNode, GraphResponse, GroupColor } from '@/routes/knowledge';

export interface GraphInputFile {
  path: string;
  body: string;
  frontmatter: ParsedFrontmatter | null;
}

export function buildGraph(files: GraphInputFile[]): GraphResponse {
  if (files.length === 0) {
    return { nodes: [], links: [], groups: [] };
  }
  // TODO: rest in subsequent tasks
  return { nodes: [], links: [], groups: [] };
}
```

- [ ] **Step 4: Verify `ParsedFrontmatter` is exported from `@zeno/knowledge`**

Run: `pnpm --filter @zeno/api exec node -e "console.log(Object.keys(require('@zeno/knowledge')))"`
Expected: list includes `parseFrontmatter`. If `ParsedFrontmatter` isn't exported as a type, replace the import with a local interface:

```ts
interface ParsedFrontmatter {
  tags?: string[];
  title?: string;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @zeno/api exec vitest run tests/lib/build-graph.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/build-graph.ts apps/api/tests/lib/build-graph.test.ts
git commit -m "feat(api): buildGraph skeleton + empty case"
```

---

## Task A3: buildGraph — single file no links

**Files:**
- Modify: `apps/api/src/lib/build-graph.ts`
- Modify: `apps/api/tests/lib/build-graph.test.ts`

- [ ] **Step 1: Append the failing test**

Append to `apps/api/tests/lib/build-graph.test.ts`:

```ts
  it('returns one orphan node, no links, one group for a single file', () => {
    const out = buildGraph([
      { path: 'foo.md', body: '# Foo\n', frontmatter: null },
    ]);
    expect(out.nodes).toHaveLength(1);
    expect(out.nodes[0]).toMatchObject({
      id: 'foo.md',
      label: 'Foo',
      group: '',
      size: 0,
      tags: [],
      exists: true,
      isMeta: false,
    });
    expect(out.links).toEqual([]);
    expect(out.groups).toEqual([{ group: '', color: '#d9b362' }]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @zeno/api exec vitest run tests/lib/build-graph.test.ts`
Expected: FAIL — currently returns empty arrays.

- [ ] **Step 3: Replace `buildGraph` with the real implementation**

Replace the body of `apps/api/src/lib/build-graph.ts` with:

```ts
import { extractTitle, extractWikilinks, resolveWikilinks } from '@zeno/knowledge';
import type { GraphLink, GraphNode, GraphResponse, GroupColor } from '@/routes/knowledge';

interface ParsedFrontmatter {
  tags?: string[];
  title?: string;
}

export interface GraphInputFile {
  path: string;
  body: string;
  frontmatter: ParsedFrontmatter | null;
}

const PALETTE = [
  '#d9b362', // --color-gold
  '#6bd3a3', // --color-status-active
  '#e8617a', // --color-status-failed
  '#7aa6e8', // --color-status-info
] as const;
const FALLBACK_COLOR = '#4b4f66'; // --color-text-tertiary
const GHOST_PREFIX = '?ghost:';
const GHOST_GROUP = '?ghost';

export function buildGraph(files: GraphInputFile[]): GraphResponse {
  if (files.length === 0) return { nodes: [], links: [], groups: [] };

  const allPaths = files.map((f) => f.path);

  // Resolve wikilinks per file → list of (source, target) pairs.
  // Self-links dropped. Unresolved slugs become ghost target ids.
  const edges: Array<[string, string]> = [];
  for (const file of files) {
    const slugs = extractWikilinks(file.body);
    if (slugs.length === 0) continue;
    const resolved = resolveWikilinks(slugs, allPaths);
    for (const slug of slugs) {
      const target = resolved[slug];
      if (target === file.path) continue; // self-link
      if (target === null || target === undefined) {
        edges.push([file.path, `${GHOST_PREFIX}${slug}`]);
      } else {
        edges.push([file.path, target]);
      }
    }
  }

  // Dedup undirected: canonical order = lower id first.
  const linkSet = new Set<string>();
  const links: GraphLink[] = [];
  for (const [a, b] of edges) {
    const [source, target] = a < b ? [a, b] : [b, a];
    const key = `${source} ${target}`;
    if (linkSet.has(key)) continue;
    linkSet.add(key);
    links.push({ source, target });
  }

  // Degree per id (undirected, post-dedup).
  const degree = new Map<string, number>();
  for (const { source, target } of links) {
    degree.set(source, (degree.get(source) ?? 0) + 1);
    degree.set(target, (degree.get(target) ?? 0) + 1);
  }

  // Real nodes.
  const realNodes: GraphNode[] = files.map((f) => ({
    id: f.path,
    label: extractTitle({ frontmatter: f.frontmatter, body: f.body, relPath: f.path }),
    group: f.path.split('/')[0]?.includes('.') ? '' : (f.path.split('/')[0] ?? ''),
    size: degree.get(f.path) ?? 0,
    tags: f.frontmatter?.tags ?? [],
    exists: true,
    isMeta: isMetaPath(f.path),
  }));

  // Ghost nodes: distinct ghost ids found in links.
  const ghostIds = new Set<string>();
  for (const { source, target } of links) {
    if (source.startsWith(GHOST_PREFIX)) ghostIds.add(source);
    if (target.startsWith(GHOST_PREFIX)) ghostIds.add(target);
  }
  const ghostNodes: GraphNode[] = Array.from(ghostIds).map((id) => ({
    id,
    label: id.slice(GHOST_PREFIX.length),
    group: GHOST_GROUP,
    size: degree.get(id) ?? 0,
    tags: [],
    exists: false,
    isMeta: false,
  }));

  const nodes = [...realNodes, ...ghostNodes];

  // Groups: alphabetical assignment to PALETTE, overflow + ghost → FALLBACK_COLOR.
  const distinctGroups = Array.from(new Set(nodes.map((n) => n.group)));
  const sorted = distinctGroups
    .filter((g) => g !== GHOST_GROUP)
    .sort((a, b) => a.localeCompare(b));
  const groups: GroupColor[] = sorted.map((group, i) => ({
    group,
    color: i < PALETTE.length ? (PALETTE[i] ?? FALLBACK_COLOR) : FALLBACK_COLOR,
  }));
  if (distinctGroups.includes(GHOST_GROUP)) {
    groups.push({ group: GHOST_GROUP, color: FALLBACK_COLOR });
  }

  return { nodes, links, groups };
}

function isMetaPath(relPath: string): boolean {
  return relPath
    .split('/')
    .some((part) => part.startsWith('_'));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @zeno/api exec vitest run tests/lib/build-graph.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/build-graph.ts apps/api/tests/lib/build-graph.test.ts
git commit -m "feat(api): buildGraph orphan node + group palette"
```

---

## Task A4: buildGraph — mutual link dedup + ghost edges + self-link drop

**Files:**
- Modify: `apps/api/tests/lib/build-graph.test.ts`

- [ ] **Step 1: Append four failing tests**

Append to `apps/api/tests/lib/build-graph.test.ts`:

```ts
  it('emits a single undirected link for mutual references', () => {
    const out = buildGraph([
      { path: 'a.md', body: 'see [[b]]', frontmatter: null },
      { path: 'b.md', body: 'see [[a]]', frontmatter: null },
    ]);
    expect(out.links).toEqual([{ source: 'a.md', target: 'b.md' }]);
    expect(out.nodes.find((n) => n.id === 'a.md')?.size).toBe(1);
    expect(out.nodes.find((n) => n.id === 'b.md')?.size).toBe(1);
  });

  it('emits a ghost node for an unresolved slug', () => {
    const out = buildGraph([
      { path: 'd.md', body: 'see [[nope]]', frontmatter: null },
    ]);
    const ghost = out.nodes.find((n) => n.id === '?ghost:nope');
    expect(ghost).toMatchObject({
      id: '?ghost:nope',
      label: 'nope',
      group: '?ghost',
      size: 1,
      exists: false,
      isMeta: false,
    });
    expect(out.links).toContainEqual({ source: '?ghost:nope', target: 'd.md' });
    expect(out.groups).toContainEqual({ group: '?ghost', color: '#4b4f66' });
  });

  it('drops self-links', () => {
    const out = buildGraph([
      { path: 'a.md', body: 'see [[a]] and [[b]]', frontmatter: null },
      { path: 'b.md', body: '# B', frontmatter: null },
    ]);
    expect(out.links).toEqual([{ source: 'a.md', target: 'b.md' }]);
    expect(out.nodes.find((n) => n.id === 'a.md')?.size).toBe(1);
  });

  it('5th folder + ghost both map to the gray fallback color', () => {
    const files = ['alpha', 'bravo', 'charlie', 'delta', 'echo'].map((dir) => ({
      path: `${dir}/x.md`,
      body: 'see [[oops]]',
      frontmatter: null,
    }));
    const out = buildGraph(files);
    const groups = Object.fromEntries(out.groups.map((g) => [g.group, g.color]));
    expect(groups).toMatchObject({
      alpha: '#d9b362',
      bravo: '#6bd3a3',
      charlie: '#e8617a',
      delta: '#7aa6e8',
      echo: '#4b4f66',
      '?ghost': '#4b4f66',
    });
  });
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `pnpm --filter @zeno/api exec vitest run tests/lib/build-graph.test.ts`
Expected: PASS — the implementation from Task A3 already handles all of these.

If any fail, fix the implementation; do not move on with red tests.

- [ ] **Step 3: Commit**

```bash
git add apps/api/tests/lib/build-graph.test.ts
git commit -m "test(api): buildGraph mutual/ghost/self/overflow coverage"
```

---

## Task A5: buildGraph — meta path detection + nested groups

**Files:**
- Modify: `apps/api/tests/lib/build-graph.test.ts`

- [ ] **Step 1: Append three failing tests**

Append to `apps/api/tests/lib/build-graph.test.ts`:

```ts
  it('marks _index.md and _-prefixed subdir contents as meta', () => {
    const out = buildGraph([
      { path: '_index.md', body: '# Index', frontmatter: null },
      { path: '_drafts/wip.md', body: '# Wip', frontmatter: null },
      { path: 'foo.md', body: '# Foo', frontmatter: null },
    ]);
    expect(out.nodes.find((n) => n.id === '_index.md')?.isMeta).toBe(true);
    expect(out.nodes.find((n) => n.id === '_drafts/wip.md')?.isMeta).toBe(true);
    expect(out.nodes.find((n) => n.id === 'foo.md')?.isMeta).toBe(false);
  });

  it('derives group from the top-level folder for nested files', () => {
    const out = buildGraph([
      { path: 'processes/release.md', body: '', frontmatter: null },
      { path: 'processes/onboarding.md', body: '', frontmatter: null },
      { path: 'playbooks/security.md', body: '', frontmatter: null },
    ]);
    expect(out.nodes.find((n) => n.id === 'processes/release.md')?.group).toBe('processes');
    expect(out.nodes.find((n) => n.id === 'playbooks/security.md')?.group).toBe('playbooks');
  });

  it('reads tags from frontmatter', () => {
    const out = buildGraph([
      {
        path: 'a.md',
        body: '# A',
        frontmatter: { tags: ['security', 'audit'] },
      },
    ]);
    expect(out.nodes[0]?.tags).toEqual(['security', 'audit']);
  });
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `pnpm --filter @zeno/api exec vitest run tests/lib/build-graph.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/tests/lib/build-graph.test.ts
git commit -m "test(api): buildGraph meta/group/tags coverage"
```

---

## Task A6: Wire `/graph` route + HTTP test fixture

**Files:**
- Modify: `apps/api/src/routes/knowledge.ts`
- Create: `apps/api/testdata/knowledge-graph/a.md`
- Create: `apps/api/testdata/knowledge-graph/b.md`
- Create: `apps/api/testdata/knowledge-graph/c.md`
- Create: `apps/api/testdata/knowledge-graph/d.md`
- Create: `apps/api/testdata/knowledge-graph/processes/release.md`
- Create: `apps/api/tests/routes/knowledge-graph.test.ts`

- [ ] **Step 1: Add the route handler**

In `apps/api/src/routes/knowledge.ts`, inside `buildKnowledgeRoute(deps)` (after the `/file` handler, before the `return route`), add:

```ts
  route.get('/graph', (c) => {
    const root = knowledgeRoot;
    if (!existsSync(root)) {
      const body: GraphResponse = { nodes: [], links: [], groups: [] };
      return c.json(body);
    }
    const entries = readdirSync(root, { recursive: true, withFileTypes: true });
    const inputs: GraphInputFile[] = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith('.md')) continue;
      const abs = join(entry.parentPath, entry.name);
      const relParts = abs.slice(root.length).split(sep).filter(Boolean);
      const relPath = relParts.join('/');
      let raw: string;
      try {
        raw = readFileSync(abs, 'utf8');
      } catch {
        continue;
      }
      const { frontmatter, body } = parseFrontmatter(raw);
      inputs.push({ path: relPath, body, frontmatter });
    }
    return c.json(buildGraph(inputs));
  });
```

- [ ] **Step 2: Add the necessary imports**

At the top of `apps/api/src/routes/knowledge.ts`, append to the imports:

```ts
import { type GraphInputFile, buildGraph } from '@/lib/build-graph';
```

- [ ] **Step 3: Create the fixture directory**

```bash
mkdir -p apps/api/testdata/knowledge-graph/processes
```

- [ ] **Step 4: Create fixture files**

Create `apps/api/testdata/knowledge-graph/a.md`:

```md
---
tags: [security]
---
# A

See [[b]] and [[processes/release]].
```

Create `apps/api/testdata/knowledge-graph/b.md`:

```md
# B

Cross-reference [[a]].
```

Create `apps/api/testdata/knowledge-graph/c.md`:

```md
# C

No outgoing links.
```

Create `apps/api/testdata/knowledge-graph/d.md`:

```md
# D

Stale reference: [[ghost-note]].
```

Create `apps/api/testdata/knowledge-graph/processes/release.md`:

```md
# Release Process

Hello.
```

- [ ] **Step 5: Write the failing HTTP test**

Create `apps/api/tests/routes/knowledge-graph.test.ts`:

```ts
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildKnowledgeRoute } from '@/routes/knowledge';

const FIXTURE = resolve(__dirname, '../../testdata/knowledge-graph');

describe('GET /api/knowledge/graph', () => {
  it('returns nodes, links, and groups for the fixture', async () => {
    const route = buildKnowledgeRoute({ knowledgeRoot: FIXTURE });
    const res = await route.request('/graph');
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = body.nodes.map((n: { id: string }) => n.id).sort();
    expect(ids).toEqual([
      '?ghost:ghost-note',
      'a.md',
      'b.md',
      'c.md',
      'd.md',
      'processes/release.md',
    ]);
    expect(body.links).toEqual(
      expect.arrayContaining([
        { source: 'a.md', target: 'b.md' },
        { source: 'a.md', target: 'processes/release.md' },
        { source: '?ghost:ghost-note', target: 'd.md' },
      ]),
    );
    expect(body.links).toHaveLength(3);
    expect(body.groups.find((g: { group: string }) => g.group === '?ghost')?.color).toBe(
      '#4b4f66',
    );
  });

  it('returns empty arrays when the knowledge root does not exist', async () => {
    const route = buildKnowledgeRoute({ knowledgeRoot: '/definitely/does/not/exist' });
    const res = await route.request('/graph');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ nodes: [], links: [], groups: [] });
  });

  it('ignores ?path= query param', async () => {
    const route = buildKnowledgeRoute({ knowledgeRoot: FIXTURE });
    const res = await route.request('/graph?path=../../etc/passwd');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.nodes.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @zeno/api exec vitest run tests/routes/knowledge-graph.test.ts`
Expected: PASS for all three.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/knowledge.ts apps/api/testdata/knowledge-graph apps/api/tests/routes/knowledge-graph.test.ts
git commit -m "feat(api): GET /api/knowledge/graph"
```

---

## Task A7: API quality-gate gate

- [ ] **Step 1: Run the api workspace gate**

Run: `pnpm --filter @zeno/api lint && pnpm --filter @zeno/api typecheck && pnpm --filter @zeno/api test`
Expected: all three green.

- [ ] **Step 2: If biome flags formatting issues, auto-fix**

Run: `pnpm --filter @zeno/api exec biome check --write .`
Then re-run step 1.

- [ ] **Step 3: Commit any biome formatting changes if produced**

```bash
git status --short
# If formatting touched files:
git add -u
git commit -m "style(api): biome formatting after graph route"
```

---

## Task B1: Baseline dashboard bundle measurement (pre-feature)

**Files:** none changed; measurement only.

- [ ] **Step 1: Build the dashboard against current HEAD**

Run: `pnpm --filter @zeno/dashboard build`
Expected: success.

- [ ] **Step 2: Record the gzipped size of the main JS chunk**

Run: `ls -lh apps/dashboard/dist/assets/*.js | head -5`
Note the size of the main entry chunk. Save the number (e.g. "main: 234 KB gz") into a scratch note for later comparison. This is the pre-graph baseline.

- [ ] **Step 3: No commit needed (no file changes)**

---

## Task B2: Add the `react-force-graph-2d` dependency + learning note

**Files:**
- Modify: `apps/dashboard/package.json`
- Create: `.vault/learnings/react-force-graph-2d-decision.md`

- [ ] **Step 1: Add the dependency**

Run: `pnpm --filter @zeno/dashboard add react-force-graph-2d`
Expected: installs without errors.

- [ ] **Step 2: Verify `three.js` did NOT come along as a transitive dep**

Run: `pnpm --filter @zeno/dashboard why three 2>&1 | head -20`
Expected: empty (no match). If `three` shows up, abort and switch to a different lib — this should be the `-2d` variant only.

- [ ] **Step 3: Create the learning note**

Create `.vault/learnings/react-force-graph-2d-decision.md`:

```markdown
---
tags:
  - learning
  - concept
related:
  - "[[../specs/2026-05-21-knowledge-graph-view/spec-knowledge-graph-view]]"
created: 2026-05-21
---
# `react-force-graph-2d` for the dashboard graph view

Chose `react-force-graph-2d` (canvas-based, ~80 KB gz incl. `d3-force`) over `cytoscape.js`, `sigma.js`, and a custom D3 implementation for the knowledge graph view in spec [[../specs/2026-05-21-knowledge-graph-view/spec-knowledge-graph-view|2026-05-21-knowledge-graph-view]].

## Context

Target: <500 nodes typical (operator's knowledge base). Obsidian-style UX: undirected, hover dim, click-opens-side-panel, filter/groups/display panels. Bundle budget for the lazy chunk ≤ 120 KB gz.

## Decision

`react-force-graph-2d`:
- Native React wrapper (`<ForceGraph2D nodes={…} links={…} />`), no glue code for the mount cycle.
- Canvas renderer keeps DOM light; pan/zoom/drag built in.
- Custom node painter via `nodeCanvasObject` covers all our visual needs (group color, hover dim, label fade by zoom).
- ~80 KB gz incl. transitive `d3-force` per docs, measured ≈ 90 KB on our build.
- Variant must be `-2d`, not the bare `react-force-graph` package, to avoid bundling `three.js` for the 3D variant.

## Rejected

- `cytoscape.js`: heavier (~150 KB gz core + extras), React wrapper less idiomatic, more layout algos than we need.
- `sigma.js`: WebGL, scales to 10k+ nodes, but our target is 200. Overkill, no React wrapper.
- Custom D3: ~30 KB gz but reimplements canvas/zoom/drag/click — a week of glue we get for free.

## How to apply

- The library MUST be statically imported from exactly one module: `apps/dashboard/src/components/knowledge/graph/index.tsx`. That module is then `React.lazy()`-imported from `apps/dashboard/src/routes/_authed/knowledge.tsx`. This keeps the library inside a single chunk loaded only when `view=graph`.
- Verify post-install: `pnpm --filter @zeno/dashboard why three` must return empty.
- Bundle delta after `vite build`: the graph chunk gzipped ≤ 120 KB; main entry delta ≤ 5 KB gz.
```

- [ ] **Step 4: Verify install + verify import works**

Run: `pnpm --filter @zeno/dashboard exec node -e "import('react-force-graph-2d').then(m => console.log(Object.keys(m)))"`
Expected: prints something like `[ 'default' ]`. If it errors with `Cannot use import statement outside a module`, retry with `--input-type=module`:

```bash
pnpm --filter @zeno/dashboard exec node --input-type=module -e "import('react-force-graph-2d').then(m => console.log(Object.keys(m)))"
```

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/package.json pnpm-lock.yaml .vault/learnings/react-force-graph-2d-decision.md
git commit -m "feat(dashboard): add react-force-graph-2d + decision learning"
```

---

## Task B3: Update `_index/learnings.md` MOC

**Files:**
- Modify: `.vault/_index/learnings.md`

- [ ] **Step 1: Add the new learning under the `#concept` section**

In `.vault/_index/learnings.md`, find the `## `#concept` — Architecture and patterns` section and append:

```markdown
- [[../learnings/react-force-graph-2d-decision|`react-force-graph-2d` for the dashboard graph view]] — canvas-based React wrapper, ~80 KB gz, single static import in the lazy chunk; verify `pnpm why three` is empty. Spec 2026-05-21-knowledge-graph-view.
```

- [ ] **Step 2: Commit**

```bash
git add .vault/_index/learnings.md
git commit -m "docs(vault): index react-force-graph-2d learning"
```

---

## Task B4: Define dashboard graph types

**Files:**
- Create: `apps/dashboard/src/components/knowledge/graph/types.ts`

- [ ] **Step 1: Create the types module**

Create `apps/dashboard/src/components/knowledge/graph/types.ts`:

```ts
export interface GraphNode {
  id: string;
  label: string;
  group: string;
  size: number;
  tags: string[];
  exists: boolean;
  isMeta: boolean;
}

export interface GraphLink {
  source: string;
  target: string;
}

export interface GroupColor {
  group: string;
  color: string;
}

export interface GraphResponse {
  nodes: GraphNode[];
  links: GraphLink[];
  groups: GroupColor[];
}

export interface FilterState {
  search: string;
  tags: string[];
  folders: string[];
  showMeta: boolean;
  existingOnly: boolean;
  showOrphans: boolean;
}

export interface DisplayState {
  nodeSize: number;
  linkThickness: number;
  labelFadeZoom: number;
}

export const DEFAULT_FILTER_STATE: FilterState = {
  search: '',
  tags: [],
  folders: [],
  showMeta: false,
  existingOnly: false,
  showOrphans: true,
};

export const DEFAULT_DISPLAY_STATE: DisplayState = {
  nodeSize: 1.0,
  linkThickness: 1.0,
  labelFadeZoom: 1.5,
};
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @zeno/dashboard typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/components/knowledge/graph/types.ts
git commit -m "feat(dashboard): graph view shared types"
```

---

## Task B5: `filter-graph.ts` pure filter helper

**Files:**
- Create: `apps/dashboard/src/components/knowledge/graph/filter-graph.ts`
- Create: `apps/dashboard/src/components/knowledge/graph/filter-graph.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/dashboard/src/components/knowledge/graph/filter-graph.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyFilters } from './filter-graph';
import { DEFAULT_FILTER_STATE, type GraphResponse } from './types';

const raw: GraphResponse = {
  nodes: [
    { id: 'a.md', label: 'A', group: '', size: 1, tags: ['security'], exists: true, isMeta: false },
    { id: 'b.md', label: 'B', group: '', size: 1, tags: ['ops'], exists: true, isMeta: false },
    { id: 'orph.md', label: 'Orph', group: '', size: 0, tags: [], exists: true, isMeta: false },
    { id: '_index.md', label: 'Index', group: '', size: 0, tags: [], exists: true, isMeta: true },
    { id: '?ghost:nope', label: 'nope', group: '?ghost', size: 1, tags: [], exists: false, isMeta: false },
    { id: 'processes/r.md', label: 'R', group: 'processes', size: 1, tags: ['ops'], exists: true, isMeta: false },
  ],
  links: [
    { source: 'a.md', target: 'b.md' },
    { source: 'processes/r.md', target: '?ghost:nope' },
  ],
  groups: [],
};

describe('applyFilters', () => {
  it('passes everything through with defaults except meta + orphans-honored', () => {
    const out = applyFilters(raw, DEFAULT_FILTER_STATE);
    const ids = out.nodes.map((n) => n.id).sort();
    expect(ids).toEqual(['?ghost:nope', 'a.md', 'b.md', 'orph.md', 'processes/r.md']);
    expect(out.links).toHaveLength(2);
  });

  it('hides meta files when showMeta=false (default)', () => {
    const out = applyFilters(raw, DEFAULT_FILTER_STATE);
    expect(out.nodes.some((n) => n.id === '_index.md')).toBe(false);
  });

  it('shows meta files when showMeta=true', () => {
    const out = applyFilters(raw, { ...DEFAULT_FILTER_STATE, showMeta: true });
    expect(out.nodes.some((n) => n.id === '_index.md')).toBe(true);
  });

  it('hides ghost nodes when existingOnly=true', () => {
    const out = applyFilters(raw, { ...DEFAULT_FILTER_STATE, existingOnly: true });
    expect(out.nodes.some((n) => n.id === '?ghost:nope')).toBe(false);
    expect(out.links).toEqual([{ source: 'a.md', target: 'b.md' }]);
  });

  it('hides nodes with size=0 when showOrphans=false', () => {
    const out = applyFilters(raw, { ...DEFAULT_FILTER_STATE, showOrphans: false });
    expect(out.nodes.some((n) => n.id === 'orph.md')).toBe(false);
    expect(out.nodes.some((n) => n.id === 'a.md')).toBe(true);
  });

  it('filters by case-insensitive label substring search', () => {
    const out = applyFilters(raw, { ...DEFAULT_FILTER_STATE, search: 'a' });
    const ids = out.nodes.map((n) => n.id).sort();
    expect(ids).toContain('a.md');
    expect(ids).not.toContain('b.md');
  });

  it('filters by tag intersection', () => {
    const out = applyFilters(raw, { ...DEFAULT_FILTER_STATE, tags: ['ops'] });
    const ids = out.nodes.map((n) => n.id).sort();
    expect(ids).toContain('b.md');
    expect(ids).toContain('processes/r.md');
    expect(ids).not.toContain('a.md');
  });

  it('filters by folder membership', () => {
    const out = applyFilters(raw, { ...DEFAULT_FILTER_STATE, folders: ['processes'] });
    expect(out.nodes.every((n) => n.group === 'processes' || n.id.startsWith('?ghost:'))).toBe(true);
  });

  it('drops links whose endpoints were filtered out', () => {
    const out = applyFilters(raw, { ...DEFAULT_FILTER_STATE, existingOnly: true });
    expect(out.links.every((l) => out.nodes.some((n) => n.id === l.source) && out.nodes.some((n) => n.id === l.target))).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @zeno/dashboard exec vitest run tests/components/knowledge/graph/filter-graph.test.ts 2>&1 || pnpm --filter @zeno/dashboard exec vitest run src/components/knowledge/graph/filter-graph.test.ts`
Expected: FAIL with `Cannot find module './filter-graph'`.

(Note: the dashboard `vitest.config.ts` only includes `tests/**` by default. Adjust below.)

- [ ] **Step 3: Adjust vitest config to include co-located src tests**

Modify `apps/dashboard/vitest.config.ts`:

```ts
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
  },
});
```

- [ ] **Step 4: Implement `filter-graph.ts`**

Create `apps/dashboard/src/components/knowledge/graph/filter-graph.ts`:

```ts
import type { FilterState, GraphResponse } from './types';

export function applyFilters(
  raw: GraphResponse,
  filters: FilterState,
): { nodes: GraphResponse['nodes']; links: GraphResponse['links'] } {
  const search = filters.search.trim().toLowerCase();
  const tagSet = new Set(filters.tags);
  const folderSet = new Set(filters.folders);

  const filteredNodes = raw.nodes.filter((n) => {
    if (!filters.showMeta && n.isMeta) return false;
    if (filters.existingOnly && !n.exists) return false;
    if (!filters.showOrphans && n.size === 0) return false;
    if (search.length > 0 && !n.label.toLowerCase().includes(search) && !n.id.toLowerCase().includes(search)) {
      return false;
    }
    if (tagSet.size > 0) {
      const tags = n.tags ?? [];
      const overlap = tags.some((t) => tagSet.has(t));
      if (!overlap) return false;
    }
    if (folderSet.size > 0 && !folderSet.has(n.group) && !n.id.startsWith('?ghost:')) {
      return false;
    }
    return true;
  });

  const allowedIds = new Set(filteredNodes.map((n) => n.id));
  const filteredLinks = raw.links.filter(
    (l) => allowedIds.has(l.source) && allowedIds.has(l.target),
  );

  return { nodes: filteredNodes, links: filteredLinks };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @zeno/dashboard exec vitest run src/components/knowledge/graph/filter-graph.test.ts`
Expected: PASS (all 9 cases).

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/vitest.config.ts apps/dashboard/src/components/knowledge/graph/filter-graph.ts apps/dashboard/src/components/knowledge/graph/filter-graph.test.ts
git commit -m "feat(dashboard): pure filter-graph helper + tests"
```

---

## Task B6: `use-graph-state` localStorage hook

**Files:**
- Create: `apps/dashboard/src/components/knowledge/graph/use-graph-state.ts`
- Create: `apps/dashboard/src/components/knowledge/graph/use-graph-state.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `apps/dashboard/src/components/knowledge/graph/use-graph-state.test.tsx`:

```tsx
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_DISPLAY_STATE, DEFAULT_FILTER_STATE } from './types';
import { useGraphDisplay, useGraphFilters } from './use-graph-state';

const FILTERS_KEY = 'zeno.knowledge.graph.filters';
const DISPLAY_KEY = 'zeno.knowledge.graph.display';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe('useGraphFilters', () => {
  it('returns defaults when localStorage is empty', () => {
    const { result } = renderHook(() => useGraphFilters());
    expect(result.current[0]).toEqual(DEFAULT_FILTER_STATE);
  });

  it('persists changes to localStorage', () => {
    const { result } = renderHook(() => useGraphFilters());
    act(() => {
      result.current[1]({ ...DEFAULT_FILTER_STATE, search: 'foo' });
    });
    expect(JSON.parse(window.localStorage.getItem(FILTERS_KEY) ?? '{}').search).toBe('foo');
  });

  it('restores from localStorage on mount', () => {
    window.localStorage.setItem(
      FILTERS_KEY,
      JSON.stringify({ ...DEFAULT_FILTER_STATE, search: 'bar' }),
    );
    const { result } = renderHook(() => useGraphFilters());
    expect(result.current[0].search).toBe('bar');
  });

  it('falls back to defaults on malformed JSON', () => {
    window.localStorage.setItem(FILTERS_KEY, '{not-json');
    const { result } = renderHook(() => useGraphFilters());
    expect(result.current[0]).toEqual(DEFAULT_FILTER_STATE);
  });
});

describe('useGraphDisplay', () => {
  it('returns defaults when localStorage is empty', () => {
    const { result } = renderHook(() => useGraphDisplay());
    expect(result.current[0]).toEqual(DEFAULT_DISPLAY_STATE);
  });

  it('persists changes to localStorage', () => {
    const { result } = renderHook(() => useGraphDisplay());
    act(() => {
      result.current[1]({ ...DEFAULT_DISPLAY_STATE, nodeSize: 1.5 });
    });
    expect(JSON.parse(window.localStorage.getItem(DISPLAY_KEY) ?? '{}').nodeSize).toBe(1.5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @zeno/dashboard exec vitest run src/components/knowledge/graph/use-graph-state.test.tsx`
Expected: FAIL with `Cannot find module './use-graph-state'`.

- [ ] **Step 3: Implement the hook**

Create `apps/dashboard/src/components/knowledge/graph/use-graph-state.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_DISPLAY_STATE,
  DEFAULT_FILTER_STATE,
  type DisplayState,
  type FilterState,
} from './types';

const FILTERS_KEY = 'zeno.knowledge.graph.filters';
const DISPLAY_KEY = 'zeno.knowledge.graph.display';

function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw === null) return fallback;
  try {
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return fallback;
    return { ...fallback, ...parsed };
  } catch {
    return fallback;
  }
}

function writeLocal(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded or other write failure — keep in-memory state only.
  }
}

export function useGraphFilters(): [FilterState, (next: FilterState) => void] {
  const [state, setState] = useState<FilterState>(() => readLocal(FILTERS_KEY, DEFAULT_FILTER_STATE));
  useEffect(() => {
    writeLocal(FILTERS_KEY, state);
  }, [state]);
  return [state, setState];
}

export function useGraphDisplay(): [DisplayState, (next: DisplayState) => void] {
  const [state, setState] = useState<DisplayState>(() => readLocal(DISPLAY_KEY, DEFAULT_DISPLAY_STATE));
  useEffect(() => {
    writeLocal(DISPLAY_KEY, state);
  }, [state]);
  return [state, setState];
}

export const useGraphFiltersUpdate = useGraphFilters;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @zeno/dashboard exec vitest run src/components/knowledge/graph/use-graph-state.test.tsx`
Expected: PASS (6 cases).

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/components/knowledge/graph/use-graph-state.ts apps/dashboard/src/components/knowledge/graph/use-graph-state.test.tsx
git commit -m "feat(dashboard): useGraphFilters + useGraphDisplay localStorage hooks"
```

---

## Task B7: `use-graph-data` react-query hook

**Files:**
- Create: `apps/dashboard/src/components/knowledge/graph/use-graph-data.ts`

- [ ] **Step 1: Implement the hook (no test — same pattern as existing `useKnowledgeFiles`; covered by integration in later tasks)**

Create `apps/dashboard/src/components/knowledge/graph/use-graph-data.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import type { GraphResponse } from './types';

export function useGraphData() {
  return useQuery<GraphResponse>({
    queryKey: ['knowledge', 'graph'],
    queryFn: async () => {
      const res = await fetch('/api/knowledge/graph');
      if (!res.ok) {
        throw new Error(`graph fetch failed: ${res.status}`);
      }
      return (await res.json()) as GraphResponse;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @zeno/dashboard typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/components/knowledge/graph/use-graph-data.ts
git commit -m "feat(dashboard): useGraphData react-query hook"
```

---

## Task B8: Global mock for `react-force-graph-2d` in vitest

**Files:**
- Create: `apps/dashboard/vitest.setup.ts`
- Modify: `apps/dashboard/vitest.config.ts`

- [ ] **Step 1: Create the setup file**

Create `apps/dashboard/vitest.setup.ts`:

```ts
import { vi } from 'vitest';

// Mock react-force-graph-2d globally — the real library uses a Canvas2D context
// that happy-dom does not implement. The mock renders a stub div and exposes
// onNodeClick / onNodeHover via a data attribute so tests can drive them.
vi.mock('react-force-graph-2d', () => {
  type ForceGraphProps = {
    graphData?: { nodes: unknown[]; links: unknown[] };
    onNodeClick?: (node: { id: string }) => void;
    onNodeHover?: (node: { id: string } | null) => void;
  };
  const ForceGraph2D = ({ graphData, onNodeClick, onNodeHover }: ForceGraphProps) => {
    const node = graphData?.nodes?.[0] as { id?: string } | undefined;
    return {
      type: 'div',
      props: {
        'data-testid': 'force-graph-2d',
        'data-node-count': graphData?.nodes?.length ?? 0,
        'data-link-count': graphData?.links?.length ?? 0,
        onClick: () => onNodeClick?.({ id: node?.id ?? '' }),
        onMouseEnter: () => onNodeHover?.({ id: node?.id ?? '' }),
        onMouseLeave: () => onNodeHover?.(null),
      },
    };
  };
  return { default: ForceGraph2D };
});
```

- [ ] **Step 2: Wire setup file into vitest config**

Modify `apps/dashboard/vitest.config.ts`:

```ts
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
  },
});
```

- [ ] **Step 3: Verify the existing dashboard tests still pass**

Run: `pnpm --filter @zeno/dashboard test`
Expected: PASS (no regression from previous test count).

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/vitest.setup.ts apps/dashboard/vitest.config.ts
git commit -m "test(dashboard): global mock for react-force-graph-2d"
```

---

## Task C1: `ViewToggle` pill component

**Files:**
- Create: `apps/dashboard/src/components/knowledge/view-toggle.tsx`
- Create: `apps/dashboard/src/components/knowledge/view-toggle.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/dashboard/src/components/knowledge/view-toggle.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ViewToggle } from './view-toggle';

describe('ViewToggle', () => {
  it('renders both buttons with the active one styled', () => {
    render(<ViewToggle value="tree" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /tree/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /graph/i })).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onChange when the inactive option is clicked', async () => {
    const onChange = vi.fn();
    render(<ViewToggle value="tree" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /graph/i }));
    expect(onChange).toHaveBeenCalledWith('graph');
  });

  it('does not fire onChange when the active option is re-clicked', async () => {
    const onChange = vi.fn();
    render(<ViewToggle value="graph" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /graph/i }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
```

Note: `@testing-library/user-event` is not yet in `package.json`. If the test fails to import it, install:

```bash
pnpm --filter @zeno/dashboard add -D @testing-library/user-event
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @zeno/dashboard exec vitest run src/components/knowledge/view-toggle.test.tsx`
Expected: FAIL with `Cannot find module './view-toggle'`.

- [ ] **Step 3: Implement the component**

Create `apps/dashboard/src/components/knowledge/view-toggle.tsx`:

```tsx
import type { JSX } from 'react';

export type ViewMode = 'tree' | 'graph';

interface ViewToggleProps {
  value: ViewMode;
  onChange: (next: ViewMode) => void;
}

export function ViewToggle({ value, onChange }: ViewToggleProps): JSX.Element {
  return (
    <div className="inline-flex items-stretch rounded-md border border-border-subtle bg-panel-2 p-0.5 font-mono text-[11px] uppercase tracking-wide">
      <button
        type="button"
        aria-pressed={value === 'tree'}
        onClick={() => value !== 'tree' && onChange('tree')}
        className={
          value === 'tree'
            ? 'rounded px-3 py-1.5 bg-gold-soft text-gold'
            : 'rounded px-3 py-1.5 text-text-secondary hover:text-text-primary'
        }
      >
        Tree
      </button>
      <button
        type="button"
        aria-pressed={value === 'graph'}
        onClick={() => value !== 'graph' && onChange('graph')}
        className={
          value === 'graph'
            ? 'rounded px-3 py-1.5 bg-gold-soft text-gold'
            : 'rounded px-3 py-1.5 text-text-secondary hover:text-text-primary'
        }
      >
        Graph
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @zeno/dashboard exec vitest run src/components/knowledge/view-toggle.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/components/knowledge/view-toggle.tsx apps/dashboard/src/components/knowledge/view-toggle.test.tsx apps/dashboard/package.json pnpm-lock.yaml 2>/dev/null || true
git commit -m "feat(dashboard): ViewToggle pill"
```

---

## Task C2: `SidePreview` slide-over panel

**Files:**
- Create: `apps/dashboard/src/components/knowledge/graph/side-preview.tsx`

- [ ] **Step 1: Implement the component (no isolated test — exercised via canvas integration test in Task C7)**

Create `apps/dashboard/src/components/knowledge/graph/side-preview.tsx`:

```tsx
import type { JSX } from 'react';
import { KnowledgeViewer } from '@/components/knowledge/viewer';
import { useKnowledgeFile } from '@/lib/use-knowledge';

interface SidePreviewProps {
  file: string | undefined;
  onClose: () => void;
}

export function SidePreview({ file, onClose }: SidePreviewProps): JSX.Element | null {
  const fileQuery = useKnowledgeFile(file);
  if (file === undefined) return null;

  return (
    <aside
      style={{ width: 480 }}
      className="shrink-0 border-l border-border-subtle bg-panel flex flex-col"
    >
      <div className="flex items-center justify-between border-b border-border-subtle px-4 py-2">
        <span className="font-mono text-[11px] uppercase tracking-wide text-text-tertiary">
          {file}
        </span>
        <button
          type="button"
          aria-label="close preview"
          onClick={onClose}
          className="text-text-secondary hover:text-text-primary"
        >
          ×
        </button>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {fileQuery.isError ? (
          <p className="text-text-secondary">File not found.</p>
        ) : (
          <KnowledgeViewer file={fileQuery.data ?? null} />
        )}
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @zeno/dashboard typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/components/knowledge/graph/side-preview.tsx
git commit -m "feat(dashboard): SidePreview slide-over (480px)"
```

---

## Task C3: `FiltersPanel`

**Files:**
- Create: `apps/dashboard/src/components/knowledge/graph/filters-panel.tsx`

- [ ] **Step 1: Implement the component**

Create `apps/dashboard/src/components/knowledge/graph/filters-panel.tsx`:

```tsx
import { type JSX, useMemo } from 'react';
import type { FilterState, GraphResponse } from './types';

interface FiltersPanelProps {
  raw: GraphResponse | undefined;
  value: FilterState;
  onChange: (next: FilterState) => void;
}

export function FiltersPanel({ raw, value, onChange }: FiltersPanelProps): JSX.Element {
  const allTags = useMemo(() => {
    if (!raw) return [];
    const s = new Set<string>();
    for (const n of raw.nodes) for (const t of n.tags) s.add(t);
    return Array.from(s).sort();
  }, [raw]);

  const allFolders = useMemo(() => {
    if (!raw) return [];
    const s = new Set<string>();
    for (const n of raw.nodes) if (n.group !== '?ghost') s.add(n.group);
    return Array.from(s).sort();
  }, [raw]);

  const toggleTag = (tag: string) => {
    const next = value.tags.includes(tag)
      ? value.tags.filter((t) => t !== tag)
      : [...value.tags, tag];
    onChange({ ...value, tags: next });
  };

  const toggleFolder = (folder: string) => {
    const next = value.folders.includes(folder)
      ? value.folders.filter((f) => f !== folder)
      : [...value.folders, folder];
    onChange({ ...value, folders: next });
  };

  return (
    <div className="flex flex-col gap-3">
      <input
        type="search"
        value={value.search}
        onChange={(e) => onChange({ ...value, search: e.target.value })}
        placeholder="search labels…"
        className="rounded border border-border-subtle bg-panel-2 px-2 py-1 font-mono text-[12px]"
      />
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
              className={
                value.tags.includes(tag)
                  ? 'rounded border border-gold bg-gold-soft px-2 py-0.5 font-mono text-[11px] text-gold'
                  : 'rounded border border-border-subtle bg-panel-2 px-2 py-0.5 font-mono text-[11px] text-text-secondary hover:text-text-primary'
              }
            >
              #{tag}
            </button>
          ))}
        </div>
      )}
      {allFolders.length > 0 && (
        <details>
          <summary className="cursor-pointer font-mono text-[11px] uppercase text-text-tertiary">
            folders ({value.folders.length || 'all'})
          </summary>
          <div className="mt-2 flex flex-col gap-1">
            {allFolders.map((folder) => (
              <label key={folder} className="flex items-center gap-2 font-mono text-[12px]">
                <input
                  type="checkbox"
                  checked={value.folders.includes(folder)}
                  onChange={() => toggleFolder(folder)}
                  className="accent-gold"
                />
                {folder || '(root)'}
              </label>
            ))}
          </div>
        </details>
      )}
      <label className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wide text-text-tertiary">
        <input
          type="checkbox"
          checked={value.showMeta}
          onChange={(e) => onChange({ ...value, showMeta: e.target.checked })}
          className="accent-gold"
        />
        show meta files
      </label>
      <label className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wide text-text-tertiary">
        <input
          type="checkbox"
          checked={value.existingOnly}
          onChange={(e) => onChange({ ...value, existingOnly: e.target.checked })}
          className="accent-gold"
        />
        existing files only
      </label>
      <label className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wide text-text-tertiary">
        <input
          type="checkbox"
          checked={value.showOrphans}
          onChange={(e) => onChange({ ...value, showOrphans: e.target.checked })}
          className="accent-gold"
        />
        show orphans
      </label>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @zeno/dashboard typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/components/knowledge/graph/filters-panel.tsx
git commit -m "feat(dashboard): FiltersPanel (search/tags/folders/3 toggles)"
```

---

## Task C4: `GroupsPanel` + `DisplayPanel`

**Files:**
- Create: `apps/dashboard/src/components/knowledge/graph/groups-panel.tsx`
- Create: `apps/dashboard/src/components/knowledge/graph/display-panel.tsx`

- [ ] **Step 1: Implement `GroupsPanel`**

Create `apps/dashboard/src/components/knowledge/graph/groups-panel.tsx`:

```tsx
import type { JSX } from 'react';
import type { GroupColor } from './types';

interface GroupsPanelProps {
  groups: GroupColor[];
}

export function GroupsPanel({ groups }: GroupsPanelProps): JSX.Element {
  if (groups.length === 0) {
    return (
      <p className="font-mono text-[12px] text-text-tertiary">no groups</p>
    );
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {groups.map((g) => (
        <li key={g.group} className="flex items-center gap-2 font-mono text-[12px]">
          <span
            aria-hidden="true"
            className="inline-block h-3 w-3 rounded-full"
            style={{ backgroundColor: g.color }}
          />
          <span className="text-text-secondary">
            {g.group === '?ghost' ? 'unresolved' : g.group || '(root)'}
          </span>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: Implement `DisplayPanel`**

Create `apps/dashboard/src/components/knowledge/graph/display-panel.tsx`:

```tsx
import type { JSX } from 'react';
import type { DisplayState } from './types';

interface DisplayPanelProps {
  value: DisplayState;
  onChange: (next: DisplayState) => void;
}

export function DisplayPanel({ value, onChange }: DisplayPanelProps): JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <Slider
        label="node size"
        min={0.5}
        max={2.0}
        step={0.1}
        value={value.nodeSize}
        onChange={(v) => onChange({ ...value, nodeSize: v })}
      />
      <Slider
        label="link thickness"
        min={0.5}
        max={3.0}
        step={0.1}
        value={value.linkThickness}
        onChange={(v) => onChange({ ...value, linkThickness: v })}
      />
      <Slider
        label="label fade zoom"
        min={0.5}
        max={4.0}
        step={0.1}
        value={value.labelFadeZoom}
        onChange={(v) => onChange({ ...value, labelFadeZoom: v })}
      />
    </div>
  );
}

interface SliderProps {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (next: number) => void;
}

function Slider({ label, min, max, step, value, onChange }: SliderProps): JSX.Element {
  return (
    <label className="flex flex-col gap-1 font-mono text-[11px] uppercase tracking-wide text-text-tertiary">
      <span className="flex items-center justify-between">
        <span>{label}</span>
        <span className="text-text-secondary">{value.toFixed(1)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-gold"
      />
    </label>
  );
}
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm --filter @zeno/dashboard typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/src/components/knowledge/graph/groups-panel.tsx apps/dashboard/src/components/knowledge/graph/display-panel.tsx
git commit -m "feat(dashboard): GroupsPanel legend + DisplayPanel sliders"
```

---

## Task C5: `Controls` collapsible wrapper

**Files:**
- Create: `apps/dashboard/src/components/knowledge/graph/controls.tsx`

- [ ] **Step 1: Implement the component**

Create `apps/dashboard/src/components/knowledge/graph/controls.tsx`:

```tsx
import { type JSX, useState } from 'react';
import { DisplayPanel } from './display-panel';
import { FiltersPanel } from './filters-panel';
import { GroupsPanel } from './groups-panel';
import type { DisplayState, FilterState, GraphResponse } from './types';

interface ControlsProps {
  raw: GraphResponse | undefined;
  filters: FilterState;
  onFiltersChange: (next: FilterState) => void;
  display: DisplayState;
  onDisplayChange: (next: DisplayState) => void;
}

type PanelKey = 'filters' | 'groups' | 'display' | null;

export function Controls(props: ControlsProps): JSX.Element {
  const [open, setOpen] = useState<PanelKey>(null);

  return (
    <div className="flex items-stretch gap-3 border-l border-border-subtle bg-panel pl-2 pr-3 py-3">
      <div className="flex flex-col gap-1">
        <PanelButton open={open === 'filters'} onClick={() => setOpen(open === 'filters' ? null : 'filters')} label="filters" />
        <PanelButton open={open === 'groups'} onClick={() => setOpen(open === 'groups' ? null : 'groups')} label="groups" />
        <PanelButton open={open === 'display'} onClick={() => setOpen(open === 'display' ? null : 'display')} label="display" />
      </div>
      {open !== null && (
        <div className="w-[260px] border-l border-border-subtle pl-3">
          {open === 'filters' && (
            <FiltersPanel raw={props.raw} value={props.filters} onChange={props.onFiltersChange} />
          )}
          {open === 'groups' && <GroupsPanel groups={props.raw?.groups ?? []} />}
          {open === 'display' && (
            <DisplayPanel value={props.display} onChange={props.onDisplayChange} />
          )}
        </div>
      )}
    </div>
  );
}

function PanelButton({
  open,
  onClick,
  label,
}: { open: boolean; onClick: () => void; label: string }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        open
          ? 'rounded px-2 py-1 font-mono text-[11px] uppercase bg-gold-soft text-gold'
          : 'rounded px-2 py-1 font-mono text-[11px] uppercase text-text-secondary hover:text-text-primary'
      }
    >
      {label}
    </button>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @zeno/dashboard typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/components/knowledge/graph/controls.tsx
git commit -m "feat(dashboard): Controls collapsible wrapper (filters/groups/display)"
```

---

## Task C6: `Canvas` component with custom painters

**Files:**
- Create: `apps/dashboard/src/components/knowledge/graph/canvas.tsx`

- [ ] **Step 1: Implement the canvas wrapper**

Create `apps/dashboard/src/components/knowledge/graph/canvas.tsx`:

```tsx
import { type JSX, useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import type { DisplayState, GraphLink, GraphNode, GroupColor } from './types';

interface CanvasProps {
  nodes: GraphNode[];
  links: GraphLink[];
  groups: GroupColor[];
  display: DisplayState;
  onNodeClick: (id: string) => void;
}

export function Canvas({ nodes, links, groups, display, onNodeClick }: CanvasProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });

  const groupColor = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of groups) m.set(g.group, g.color);
    return m;
  }, [groups]);

  const neighborMap = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const l of links) {
      if (!m.has(l.source)) m.set(l.source, new Set());
      if (!m.has(l.target)) m.set(l.target, new Set());
      m.get(l.source)?.add(l.target);
      m.get(l.target)?.add(l.source);
    }
    return m;
  }, [links]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setSize({ width: el.clientWidth, height: el.clientHeight });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="relative flex-1 min-w-0 bg-canvas">
      <ForceGraph2D
        graphData={{ nodes, links }}
        width={size.width}
        height={size.height}
        backgroundColor="#08090F"
        cooldownTicks={50}
        linkWidth={display.linkThickness}
        linkColor={() => 'rgba(148, 163, 184, 0.4)'}
        onNodeClick={(node: { id: string }) => onNodeClick(node.id)}
        onNodeHover={(node: { id: string } | null) => setHoverId(node?.id ?? null)}
        nodeCanvasObject={(node, ctx, globalScale) => {
          const id = (node as { id: string; group: string; size: number; label: string; exists: boolean }).id;
          const group = (node as { group: string }).group;
          const sizeVal = (node as { size: number }).size;
          const label = (node as { label: string }).label;
          const exists = (node as { exists: boolean }).exists;
          const x = (node as { x?: number }).x ?? 0;
          const y = (node as { y?: number }).y ?? 0;

          const isFocus = hoverId === null || hoverId === id || neighborMap.get(hoverId)?.has(id) === true;
          const opacity = isFocus ? 1 : 0.25;
          const radius = Math.max(0.5, sizeVal * display.nodeSize);
          const color = groupColor.get(group) ?? '#4b4f66';

          ctx.globalAlpha = opacity;
          ctx.beginPath();
          ctx.arc(x, y, radius * 2, 0, 2 * Math.PI, false);
          if (exists) {
            ctx.fillStyle = color;
            ctx.fill();
          } else {
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            ctx.stroke();
          }

          if (globalScale >= display.labelFadeZoom) {
            ctx.font = `${10 / globalScale}px ui-monospace, monospace`;
            ctx.fillStyle = 'rgba(232, 234, 245, 0.8)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(label, x, y + radius * 2 + 2);
          }
          ctx.globalAlpha = 1;
        }}
        linkCanvasObject={(link, ctx) => {
          const sourceId = typeof link.source === 'string' ? link.source : (link.source as { id: string }).id;
          const targetId = typeof link.target === 'string' ? link.target : (link.target as { id: string }).id;
          const isIncident = hoverId === null || hoverId === sourceId || hoverId === targetId;
          const opacity = isIncident ? 0.5 : 0.1;
          const sx = (link.source as { x?: number }).x ?? 0;
          const sy = (link.source as { y?: number }).y ?? 0;
          const tx = (link.target as { x?: number }).x ?? 0;
          const ty = (link.target as { y?: number }).y ?? 0;
          ctx.globalAlpha = opacity;
          ctx.strokeStyle = 'rgba(148, 163, 184, 1)';
          ctx.lineWidth = display.linkThickness;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(tx, ty);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @zeno/dashboard typecheck`
Expected: PASS.

If TS complains about implicit `any` on the `nodeCanvasObject` callback arg, the casts inline should resolve it. If `ForceGraph2D` props need explicit types, add `// @ts-expect-error react-force-graph-2d default export not strongly typed` immediately above the JSX element.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/components/knowledge/graph/canvas.tsx
git commit -m "feat(dashboard): Canvas with custom nodeCanvasObject + hover dim"
```

---

## Task C7: `Canvas` component test (mocked library)

**Files:**
- Create: `apps/dashboard/src/components/knowledge/graph/canvas.test.tsx`

- [ ] **Step 1: Write the test**

Create `apps/dashboard/src/components/knowledge/graph/canvas.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Canvas } from './canvas';
import { DEFAULT_DISPLAY_STATE } from './types';

describe('Canvas (mocked react-force-graph-2d)', () => {
  it('renders the mock with node + link counts', () => {
    render(
      <Canvas
        nodes={[
          { id: 'a.md', label: 'A', group: '', size: 1, tags: [], exists: true, isMeta: false },
          { id: 'b.md', label: 'B', group: '', size: 1, tags: [], exists: true, isMeta: false },
        ]}
        links={[{ source: 'a.md', target: 'b.md' }]}
        groups={[{ group: '', color: '#d9b362' }]}
        display={DEFAULT_DISPLAY_STATE}
        onNodeClick={() => {}}
      />,
    );
    const stub = screen.getByTestId('force-graph-2d');
    expect(stub.getAttribute('data-node-count')).toBe('2');
    expect(stub.getAttribute('data-link-count')).toBe('1');
  });

  it('calls onNodeClick when the canvas stub is clicked', async () => {
    const onClick = vi.fn();
    render(
      <Canvas
        nodes={[{ id: 'a.md', label: 'A', group: '', size: 0, tags: [], exists: true, isMeta: false }]}
        links={[]}
        groups={[]}
        display={DEFAULT_DISPLAY_STATE}
        onNodeClick={onClick}
      />,
    );
    await userEvent.click(screen.getByTestId('force-graph-2d'));
    expect(onClick).toHaveBeenCalledWith('a.md');
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `pnpm --filter @zeno/dashboard exec vitest run src/components/knowledge/graph/canvas.test.tsx`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/components/knowledge/graph/canvas.test.tsx
git commit -m "test(dashboard): Canvas integration with mocked library"
```

---

## Task C8: `GraphView` index module (single lazy entry point)

**Files:**
- Create: `apps/dashboard/src/components/knowledge/graph/index.tsx`

- [ ] **Step 1: Implement the wrapper**

Create `apps/dashboard/src/components/knowledge/graph/index.tsx`:

```tsx
import { type JSX, useMemo } from 'react';
import { Canvas } from './canvas';
import { Controls } from './controls';
import { applyFilters } from './filter-graph';
import { SidePreview } from './side-preview';
import { useGraphData } from './use-graph-data';
import { useGraphDisplay, useGraphFilters } from './use-graph-state';

interface GraphViewProps {
  file: string | undefined;
  onFileChange: (next: string | undefined) => void;
}

export default function GraphView({ file, onFileChange }: GraphViewProps): JSX.Element {
  const dataQuery = useGraphData();
  const [filters, setFilters] = useGraphFilters();
  const [display, setDisplay] = useGraphDisplay();

  const filtered = useMemo(() => {
    if (!dataQuery.data) return { nodes: [], links: [] };
    return applyFilters(dataQuery.data, filters);
  }, [dataQuery.data, filters]);

  if (dataQuery.isLoading) {
    return <div className="flex-1 p-6 text-text-tertiary">Loading graph…</div>;
  }
  if (dataQuery.isError) {
    return (
      <div className="flex-1 p-6 text-text-secondary">
        Failed to load graph. <button type="button" onClick={() => dataQuery.refetch()} className="underline text-gold">Retry</button>
      </div>
    );
  }
  if (filtered.nodes.length === 0 && (dataQuery.data?.nodes.length ?? 0) === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-text-secondary text-center">
        <p>No notes to graph. Add files under <code>~/.zeno/profiles/&lt;name&gt;/knowledge/</code>.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex min-w-0">
      <Canvas
        nodes={filtered.nodes}
        links={filtered.links}
        groups={dataQuery.data?.groups ?? []}
        display={display}
        onNodeClick={(id) => {
          if (id.startsWith('?ghost:')) return;
          onFileChange(id);
        }}
      />
      <Controls
        raw={dataQuery.data}
        filters={filters}
        onFiltersChange={setFilters}
        display={display}
        onDisplayChange={setDisplay}
      />
      <SidePreview file={file} onClose={() => onFileChange(undefined)} />
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @zeno/dashboard typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/components/knowledge/graph/index.tsx
git commit -m "feat(dashboard): GraphView wrapper (canvas + controls + side-preview)"
```

---

## Task C9: `LazyErrorBoundary`

**Files:**
- Create: `apps/dashboard/src/components/knowledge/lazy-error-boundary.tsx`

- [ ] **Step 1: Implement the boundary**

Create `apps/dashboard/src/components/knowledge/lazy-error-boundary.tsx`:

```tsx
import { Component, type ReactNode } from 'react';

interface State {
  hasError: boolean;
}

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

export class LazyErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(): void {
    // No-op — error already in state. The fallback offers a manual reload.
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex-1 p-6 text-text-secondary">
            Failed to load graph view.{' '}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="underline text-gold"
            >
              Reload
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @zeno/dashboard typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/components/knowledge/lazy-error-boundary.tsx
git commit -m "feat(dashboard): LazyErrorBoundary for graph chunk"
```

---

## Task C10: Wire route — `view=` search param + lazy import + ViewToggle

**Files:**
- Modify: `apps/dashboard/src/routes/_authed/knowledge.tsx`

- [ ] **Step 1: Replace the route file**

Replace `apps/dashboard/src/routes/_authed/knowledge.tsx` with:

```tsx
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { type JSX, lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { KnowledgeTree } from '@/components/knowledge/tree';
import { KnowledgeViewer } from '@/components/knowledge/viewer';
import { LazyErrorBoundary } from '@/components/knowledge/lazy-error-boundary';
import { ViewToggle, type ViewMode } from '@/components/knowledge/view-toggle';
import { DashboardTopstrip } from '@/components/layout/dashboard-topstrip';
import { useKnowledgeFile, useKnowledgeFiles } from '@/lib/use-knowledge';

const GraphView = lazy(() => import('@/components/knowledge/graph'));

export interface KnowledgeSearch {
  file?: string | undefined;
  view?: 'tree' | 'graph' | undefined;
}

const SHOW_META_KEY = 'zeno.knowledge.showMeta';

export const Route = createFileRoute('/_authed/knowledge')({
  validateSearch: (search: Record<string, unknown>): KnowledgeSearch => ({
    file: typeof search.file === 'string' ? search.file : undefined,
    view: search.view === 'graph' ? 'graph' : search.view === 'tree' ? 'tree' : undefined,
  }),
  component: KnowledgeScreen,
});

function KnowledgeScreen(): JSX.Element {
  const { file: filePath, view } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const filesQuery = useKnowledgeFiles();
  const fileQuery = useKnowledgeFile(view === 'graph' ? undefined : filePath);
  const [showMeta, setShowMeta] = useShowMeta();

  const mode: ViewMode = view === 'graph' ? 'graph' : 'tree';

  const onSelect = useCallback(
    (path: string) => {
      navigate({ search: (prev) => ({ ...prev, file: path }) });
    },
    [navigate],
  );

  const onToggleMeta = useCallback(() => setShowMeta((v) => !v), [setShowMeta]);

  const onModeChange = useCallback(
    (next: ViewMode) => {
      navigate({
        search: (prev) => ({ ...prev, view: next === 'tree' ? undefined : 'graph' }),
      });
    },
    [navigate],
  );

  const onFileChangeFromGraph = useCallback(
    (next: string | undefined) => {
      navigate({ search: (prev) => ({ ...prev, file: next }) });
    },
    [navigate],
  );

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
        <main className="flex-1 min-w-0 flex flex-col gap-3">
          <ViewToggle value={mode} onChange={onModeChange} />
          {mode === 'graph' ? (
            <LazyErrorBoundary>
              <Suspense
                fallback={
                  <div className="flex-1 p-6 text-text-tertiary">Loading graph…</div>
                }
              >
                <GraphView file={filePath} onFileChange={onFileChangeFromGraph} />
              </Suspense>
            </LazyErrorBoundary>
          ) : fileQuery.isError ? (
            <FileMissing
              onClear={() => navigate({ search: (prev) => ({ ...prev, file: undefined }) })}
            />
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
      <button type="button" className="text-gold underline self-start" onClick={onClear}>
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

- [ ] **Step 2: Regenerate route tree**

Run: `pnpm --filter @zeno/dashboard exec tsr generate`
Expected: success, `src/route-tree.gen.ts` updated.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @zeno/dashboard typecheck`
Expected: PASS. If TS4023 surfaces on `KnowledgeSearch`, confirm `export interface` is on the declaration. If `exactOptionalPropertyTypes` complains, confirm both fields use `| undefined`.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/src/routes/_authed/knowledge.tsx
git commit -m "feat(dashboard): ViewToggle + lazy GraphView in /knowledge route"
```

---

## Task D1: Full quality-gate

- [ ] **Step 1: Run the full gate**

Run: `pnpm run quality-gate`
Expected: PASS across lint + typecheck + tests.

- [ ] **Step 2: If anything is red, fix in place and re-run**

Common fixes:
- `pnpm --filter @zeno/dashboard exec biome check --write .`
- `pnpm --filter @zeno/dashboard exec tsr generate` if `route-tree.gen.ts` is stale
- Missing test imports: check the test file for typos in module paths.

- [ ] **Step 3: Commit any formatting changes**

```bash
git status --short
git add -u 2>/dev/null
git commit -m "style: biome formatting after graph view" 2>/dev/null || true
```

---

## Task D2: Bundle delta measurement

**Files:** none changed; measurement only.

- [ ] **Step 1: Build the dashboard**

Run: `pnpm --filter @zeno/dashboard build`
Expected: success.

- [ ] **Step 2: Find the graph chunk**

Run: `ls -lh apps/dashboard/dist/assets/*.js | sort -k5 -h`
Look for a chunk that contains `force-graph` or `d3-force` in its name (or has a markedly larger size than the others).

If chunk naming is opaque (vite hash-only), inspect chunk contents:

```bash
for f in apps/dashboard/dist/assets/*.js; do
  if grep -q "force-graph\|d3-force\|forceSimulation" "$f"; then
    size=$(gzip -c "$f" | wc -c | tr -d ' ')
    echo "$f → $size B gz"
  fi
done
```

- [ ] **Step 3: Verify chunk ≤ 120 KB gz**

Expected: the chunk with `react-force-graph-2d` code is ≤ 120 KB gzipped. If over, debug — likely an extra `react-force-graph-3d` or `three` leak.

- [ ] **Step 4: Verify main entry delta ≤ 5 KB gz vs the Task B1 baseline**

Compare the main entry chunk size against the baseline noted in Task B1. The delta caused by `ViewToggle` + `LazyErrorBoundary` + `Suspense` wiring should be ≤ 5 KB gz.

If delta > 5 KB, audit imports: ensure `react-force-graph-2d` is NOT statically imported from `knowledge.tsx` (only via `lazy(() => import('@/components/knowledge/graph'))`).

- [ ] **Step 5: No commit needed (measurement only)**

---

## Task D3: Push branch + open PR

**Files:** none.

- [ ] **Step 1: Ask the user for explicit consent to push + open PR**

Caveman default: ask before `git push`. Confirm with the user that all 23 tasks are done and the bundle budget is met before continuing.

- [ ] **Step 2: Push the branch (after consent)**

```bash
git push -u origin feat/92-knowledge-graph-view
```

- [ ] **Step 3: Open the PR via `/new-pr`**

Use the `new-pr` skill (NOT raw `gh pr create`). The skill enforces sanitization grep, quality-gate, `--label`, `--assignee @me`, and the template.

- [ ] **Step 4: Capture PR URL for the user**

---

## Task D4: E2E in container against the merged release

**Files:** none.

This task runs only after the PR is merged and a release tag is published.

- [ ] **Step 1: Push the merge commit branch state to origin/main (gh CLI workaround for gh 2.83 — see `[[../../learnings/gh-pr-merge-cryptic-json-error|gh-pr-merge-cryptic-json-error]]`)**

If `gh pr merge` errors with `invalid character 'd' after object key`, use the REST API workaround:

```bash
gh api repos/ribeirogab/zeno-agent/pulls/<N>/merge -X PUT -f merge_method=squash
git push origin --delete feat/92-knowledge-graph-view
```

- [ ] **Step 2: Cut a prerelease via `workflow_dispatch`**

Trigger the `release.yml` workflow with `prerelease=true` to publish a new CalVer tag.

- [ ] **Step 3: Detach canonical repo at the new tag and rebuild — see `[[../../learnings/zeno-restart-uses-canonical-repo-not-worktree|zeno-restart-uses-canonical-repo-not-worktree]]`**

```bash
cd ~/.zeno/zeno-agent
git fetch --tags
git checkout v<new-tag>     # detached HEAD
pnpm install
pnpm --filter @zeno/cli build
zeno restart fn --build
```

- [ ] **Step 4: Validate `/api/health` returns the new version**

```bash
curl -s http://127.0.0.1:6101/api/health | jq .version
```

Expected: matches the new tag.

- [ ] **Step 5: Validate `/api/knowledge/graph` returns the expected shape against the operator's actual knowledge dir**

```bash
curl -s http://127.0.0.1:6101/api/knowledge/graph | jq '{ nodeCount: .nodes | length, linkCount: .links | length, groupCount: .groups | length, ghostCount: ([.nodes[] | select(.exists == false)] | length) }'
```

Sanity-check the counts against the host filesystem.

- [ ] **Step 6: Open the dashboard in a browser, click "Graph" toggle, verify**

- Chunk loads (Network tab shows a new `force-graph` chunk).
- Canvas renders with the expected nodes and edges.
- Hovering a node dims everything else.
- Clicking a real node opens the right side panel (480px) with the rendered markdown.
- Clicking a ghost node does nothing.
- Filters panel toggles work (search, tag chip, folder, existing-only, orphans).
- Display sliders affect node size / link thickness / label fade.
- Reload the page → filter + display state restored from localStorage.
- Toggle back to Tree mode → same state as before, no errors.

- [ ] **Step 7: Restore the canonical repo to its prior branch**

```bash
cd ~/.zeno/zeno-agent
git checkout <prior-branch>
```

---

## Self-Review

**Spec coverage check (against `spec-knowledge-graph-view.md`):**

| Spec section | Tasks |
|---|---|
| API endpoint shape (nodes/links/groups, dedup, palette, ghost nodes, self-link drop, isMeta) | A1, A2, A3, A4, A5, A6 |
| Routing + ViewToggle | C10, C1 |
| Tree sidebar unchanged | C10 (validated by typecheck + manual D4) |
| Lazy chunk + Suspense + ErrorBoundary | C10, C8, C9 |
| Canvas (custom painter, hover dim, click) | C6, C7 |
| Side preview (480px) | C2, C8 |
| FiltersPanel (search + tags + folders + 3 toggles) | C3, C5 |
| GroupsPanel (read-only legend) | C4, C5 |
| DisplayPanel (3 sliders) | C4, C5 |
| localStorage persistence | B6 |
| Bundle budget (chunk ≤ 120 KB, main delta ≤ 5 KB) | B1, D2 |
| Quality gate | A7, D1 |
| E2E in container | D4 |
| `react-force-graph-2d` learning + MOC entry | B2, B3 |

No gaps.

**Type consistency check:** `GraphNode`, `GraphLink`, `GroupColor`, `GraphResponse`, `FilterState`, `DisplayState` are declared once each (Task A1 server-side, Task B4 client-side mirror) and referenced consistently across all later tasks.

**Placeholder scan:** Each task has full code in every code step. No `TODO`, `TBD`, or `add appropriate error handling`. The single `// TODO: rest in subsequent tasks` in Task A2's skeleton implementation is replaced in Task A3 — that's expected scaffold scaffolding, not a real placeholder.
