---
feature: knowledge-folder-per-profile
spec: "[[spec-knowledge-folder-per-profile]]"
created: 2026-05-20
---
# Per-Profile Knowledge Folder + Auto-Index — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking and live in `[[tasks-knowledge-folder-per-profile]]`.

**Goal:** Add a per-profile `knowledge/` folder bind-mounted read-only into the worker container, with an auto-generated `_index.md` table of contents injected into the cached system prompt every turn. Tracks issue [#90](https://github.com/ribeirogab/zeno-agent/issues/90).

**Architecture:** New shared workspace package `@zeno/knowledge` exposes a pure `scanKnowledge(rootPath) → FileMeta[]` and `renderIndex(files, opts) → { markdown, unresolvedRelated }`. The CLI (`zeno knowledge index/list/open`) uses it host-side to render `_index.md` to disk. The worker uses it in-process via a new `apps/worker/src/knowledge/loader.ts` that reads `/app/knowledge/_index.md` if present-and-non-stale, otherwise live-scans and renders in-memory, then applies an 8 KB cap before injecting the block into the cached system prompt via an extended `buildSystemPrompt(soul, agents, knowledgeBlock)`. Hot-reload reuses the existing `ProfileWatcher` debounce machinery — a new `'knowledge'` group is added to `classify()` and a new `onKnowledgeChanged` callback rebuilds the prompt. The bind mount is added to `apps/cli/src/lib/orchestrator/docker.ts` (`ContainerSpec.knowledgeMountSource → /app/knowledge`, read-only). Profile creation scaffolds `knowledge/_template.md` + `knowledge/_index.md` from `templates/profile/knowledge/`.

**Tech Stack:** TypeScript (strict mode), Node.js 24 LTS, pnpm workspaces, vitest, biome, citty, dockerode, `yaml` for frontmatter parsing, `@anthropic-ai/claude-agent-sdk` (preset `claude_code`).

**For this spec:** [[spec-knowledge-folder-per-profile]]

---

## Approach

Three independent surfaces are touched:

1. **A new pure package `@zeno/knowledge`.** Six small modules — `frontmatter.ts`, `title.ts`, `description.ts`, `scan.ts`, `related.ts`, `render.ts`, `cap.ts` — composed by `index.ts`. Pure functions, no I/O coupling, fully unit-testable with vitest fixtures. Scanner uses Node 24's recursive `readdirSync` (`{ recursive: true, withFileTypes: true }`); frontmatter parsing uses the existing workspace dep `yaml` (already in worker; added to this package). No new external deps.
2. **Worker side: load + inject + watch.** A new `apps/worker/src/knowledge/loader.ts` decides between disk `_index.md` and live in-memory scan, applies the 8 KB cap, and returns `{ content, truncated, originalBytes, droppedCount }`. `buildSystemPrompt` gains a third parameter; when non-null/non-empty the block is appended as `# Knowledge available\n\n<content>` after AGENTS. `ProfileWatcher.classify()` gets a new `'knowledge'` group matching `profile/knowledge/**/*.md` (still skipping `_`-prefixed basenames so `_drafts/` churn never dispatches); `ProfileWatcherOptions` gains `onKnowledgeChanged?` and the worker boot wires it to a handler that re-calls `loadKnowledgeBlock()` and rebuilds the prompt. Per [[../../learnings/hot-reload-needs-getter-not-snapshot]], the handler always re-derives from the current filesystem — never reuses a boot-time snapshot.
3. **CLI + Docker + scaffolding.** A new `zeno knowledge` command tree (`list`, `open`, `index` — no `edit`) is registered. `apps/cli/src/lib/orchestrator/types.ts` `ContainerSpec` gains `knowledgeMountSource`; `docker.ts` adds the bind. `apps/cli/src/commands/start.ts` ensures `knowledgeDir(<profile>)` exists before invoking the orchestrator (handles older profiles). `materializeProfile()` copies `knowledge/_index.md` + `knowledge/_template.md` from `templates/profile/knowledge/`. `profile create` output and `profile show` output gain knowledge lines. `apps/cli/tsup.config.ts` `noExternal` adds `@zeno/knowledge` per [[../../learnings/tsup-bundle-symlinked-cli]]. `infra/Dockerfile` gets three new COPY lines for the package in both deps and runtime stages per [[../../learnings/workspace-node-modules-in-docker]].

Constitution edits (line ~47 mounted volumes + line ~88 runtime-context enumeration) are surgical. Docs add a new `knowledge.mdx` concepts page + a paragraph in `profile.mdx` + a meta.json entry. Both `_template.md` and `_index.md` template files ship in `templates/profile/knowledge/`.

The hot-reload story is identical to the `AGENTS.md` story from spec [[../2026-05-20-agents-md-per-instance/spec-agents-md-per-instance|0086]] — same `ProfileWatcher` debounce, same prompt-cache invalidation cadence, same system-prompt rebuild path. The only new wrinkle is the `'knowledge'` group classification and the live-scan fallback in the loader.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `packages/knowledge/package.json` | Create | New workspace package `@zeno/knowledge`. Declares `yaml` dep (shared with worker). |
| `packages/knowledge/tsconfig.json` | Create | Extends `tsconfig.base.json`. `outDir: dist`, `rootDir: src`. |
| `packages/knowledge/src/index.ts` | Create | Re-exports `scanKnowledge`, `renderIndex`, `applyCap`, `FileMeta` type. |
| `packages/knowledge/src/frontmatter.ts` | Create | Pure: split `<body>` and parsed `<frontmatter>` from raw markdown. Uses `yaml.parse`. Returns `null` frontmatter on missing or malformed. |
| `packages/knowledge/src/title.ts` | Create | Pure: `extractTitle({ frontmatter, body, relPath }) → string`. Chain: `frontmatter.title → first H1 → filename without .md`. |
| `packages/knowledge/src/description.ts` | Create | Pure: `extractDescription({ frontmatter, body }) → string`. Chain: `frontmatter.description → first non-heading paragraph after frontmatter, truncated to 120 chars with ellipsis → empty`. |
| `packages/knowledge/src/scan.ts` | Create | Walks `rootPath` recursively with `readdirSync({ recursive: true, withFileTypes: true })`. Skips any path segment whose basename starts with `_`. Parses each `.md` file. Returns `FileMeta[]` sorted by case-insensitive `relPath`. |
| `packages/knowledge/src/related.ts` | Create | Pure: `resolveRelated(files, perFileSlugs) → { resolved: Map<file → Map<slug → relPath>>, unresolved: Array<{ file, slug }> }`. Slug matches by basename without extension; path-prefix (`engineering/stack`) disambiguates; multi-match without prefix → unresolved. |
| `packages/knowledge/src/render.ts` | Create | Composes `_index.md` markdown: banner + heading + Last refreshed + Total + `## Files` (nested tree with title/description/related inline) + `## By tag` (alpha-sorted, omitted when no tags). Returns `{ markdown, unresolvedRelated }`. |
| `packages/knowledge/src/cap.ts` | Create | Pure: `applyCap(markdown, capBytes) → { content, truncated, originalBytes, droppedCount }`. Truncates at the nearest line break ≤ cap, appends literal `(N files truncated — use Read tool with \`ls /app/knowledge\` for full list)`. |
| `packages/knowledge/tests/*.test.ts` | Create | One vitest file per module + one composition test. Fixture trees under `packages/knowledge/tests/fixtures/`. |
| `apps/worker/src/knowledge/loader.ts` | Create | `loadKnowledgeBlock() → { content, truncated, originalBytes, droppedCount, fileCount, source: 'index' \| 'scan-missing' \| 'scan-stale' \| 'absent' }`. Reads `/app/knowledge/_index.md` if present-and-non-stale; otherwise scans + renders in-memory; applies 8 KB cap. |
| `apps/worker/tests/knowledge/loader.test.ts` | Create | Cases: dir absent, `_index.md` present non-stale, `_index.md` missing → scan, `_index.md` stale → scan, over-cap truncation. |
| `apps/worker/src/agent/system-prompt.ts` | Modify | Extend `buildSystemPrompt(soul, agents, knowledgeBlock)`. Append `\n\n# Knowledge available\n\n${knowledgeBlock}` when non-null/non-empty; omit section entirely otherwise. |
| `apps/worker/tests/agent/system-prompt.test.ts` | Modify | Add cases: null knowledgeBlock → no `# Knowledge available`. Non-null → appended. |
| `apps/worker/src/profile/watcher.ts` | Modify | Extend `FileGroup` with `'knowledge'`. Extend `classify()`: `profile/knowledge/**/*.md` (not `_`-prefixed) → `'knowledge'`. Extend `ProfileWatcherOptions` with `onKnowledgeChanged?`. Extend `dispatch()` switch. |
| `apps/worker/tests/profile/watcher.test.ts` | Modify | Add cases: `profile/knowledge/foo.md` → `'knowledge'`; `profile/knowledge/_drafts/x.md` → `'ignored'`; `profile/knowledge/_index.md` → `'knowledge'` (since it's not `_`-prefixed-leading-path — wait, `_index.md` IS `_`-prefixed; spec says to include it. Reconfirm at task time). |
| `apps/worker/src/index.ts` | Modify | Add `loadKnowledgeBlock` import. Add holder + boot load. Extend `buildPromptNow()` to include knowledgeBlock. Add `onKnowledgeChanged` to watcher with prompt rebuild. Emit knowledge events. |
| `apps/cli/src/lib/orchestrator/types.ts` | Modify | `ContainerSpec` gains `knowledgeMountSource: string`. |
| `apps/cli/src/lib/orchestrator/docker.ts` | Modify | Add `{ Type: 'bind', Source: spec.knowledgeMountSource, Target: '/app/knowledge', ReadOnly: true }` to `Mounts`. |
| `apps/cli/src/lib/orchestrator/mock.ts` | Modify | Capture `knowledgeMountSource` so existing tests continue to compile. |
| `apps/cli/src/lib/paths.ts` | Modify | Add `knowledgeDir(name) → join(profileDir(name), 'knowledge')`. |
| `apps/cli/src/lib/templates.ts` | Modify | Add `readKnowledgeTemplateMd()` + `readKnowledgeIndexPlaceholder()`. Extend `materializeProfile()` to `mkdirSync(knowledgeDir(name))` + write both template files. |
| `apps/cli/src/commands/profile-create.ts` | Modify | Output `  Knowledge:  ~/.zeno/profiles/<name>/knowledge/` line after the `AGENTS.md:` line. |
| `apps/cli/src/commands/profile-show.ts` | Modify | Print `  Knowledge:  <N> files · <bytes>` (or `  Knowledge:  (not created)`). Add `/app/knowledge` to the Mounts listing. |
| `apps/cli/src/commands/start.ts` | Modify | Compute `knowledgeMountSource` via `knowledgeDir(name)`; `mkdirSync(..., { recursive: true })` if missing; pass through `createContainer(spec)`. |
| `apps/cli/src/commands/knowledge.ts` | Create | Parent command registering `list`, `open`, `index` subcommands. |
| `apps/cli/src/commands/knowledge-list.ts` | Create | Reads profile's knowledge dir via `scanKnowledge`, prints `<relPath>  <title>  [<tags>]  <bytes>B` lines. |
| `apps/cli/src/commands/knowledge-open.ts` | Create | `spawn` `open` / `xdg-open` / `explorer` with `knowledgeDir(name)`. Exit 1 on unsupported platform. |
| `apps/cli/src/commands/knowledge-index.ts` | Create | `scanKnowledge + renderIndex` → write `_index.md`. Print `Indexed <N> files (<size>) in <path>`. Print `Warning: <K> unresolved related links:` block when present. |
| `apps/cli/src/index.ts` | Modify | Register `knowledge` subcommand. |
| `apps/cli/tsup.config.ts` | Modify | Add `@zeno/knowledge` to `noExternal` per [[../../learnings/tsup-bundle-symlinked-cli]]. |
| `apps/cli/package.json` | Modify | Add `"@zeno/knowledge": "workspace:*"` to deps. |
| `apps/worker/package.json` | Modify | Add `"@zeno/knowledge": "workspace:*"` to deps. |
| `infra/Dockerfile` | Modify | Add `COPY packages/knowledge/package.json ./packages/knowledge/` in deps stage; add three COPY lines (dist + package.json + node_modules) in runtime stage per [[../../learnings/workspace-node-modules-in-docker]]. |
| `templates/profile/knowledge/_template.md` | Create | Exact content from spec "Template content (exact)" section. |
| `templates/profile/knowledge/_index.md` | Create | Exact placeholder from spec "Index placeholder content (exact)" section. |
| `apps/docs/content/docs/knowledge.mdx` | Create | Concepts page covering six topics enumerated in spec AC (what knowledge is, folder structure + `_*` ignore rule, frontmatter shape, four operator scales with examples, agent consumption, three CLI commands). |
| `apps/docs/content/docs/profile.mdx` | Modify | Add a paragraph in the walkthrough mentioning the knowledge folder + the three CLI commands. |
| `apps/docs/content/docs/meta.json` | Modify | Include `"knowledge"` in the `pages` array under `---Concepts---`. |
| `.vault/constitution.md` | Modify | Line ~47: extend mounted-volumes list to include `knowledge/` (read-only). Line ~88: update runtime-context enumeration from three to four sources per spec. |

---

## Sequencing

The plan is structured as six phases so the quality-gate stays green at each phase boundary:

1. **Phase 1 — `@zeno/knowledge` package.** Pure package, no app dependencies. Lands self-contained with full unit-test coverage. After Phase 1, `pnpm --filter @zeno/knowledge test` passes; no other workspace touched.
2. **Phase 2 — Worker integration.** Extend `buildSystemPrompt`, add `loader.ts`, extend watcher classification + dispatch, wire boot. Adds `@zeno/knowledge` as worker dep. After Phase 2, worker builds + tests pass; CLI untouched.
3. **Phase 3 — Templates + scaffolding.** Create `templates/profile/knowledge/`, extend `materializeProfile`, update `paths.ts`. After Phase 3, `pnpm --filter @zeno/cli test` passes; templates exist on disk.
4. **Phase 4 — Docker + CLI commands.** Add `knowledgeMountSource` to `ContainerSpec`, extend `docker.ts`, `start.ts`, register `knowledge` command tree, update `profile-create.ts` / `profile-show.ts` output. Add `@zeno/knowledge` to CLI deps + `noExternal`. After Phase 4, `zeno start` mounts the folder + `zeno knowledge` subcommands work end-to-end against a real profile.
5. **Phase 5 — Dockerfile + docs + constitution.** Add COPY lines in `infra/Dockerfile`, write `knowledge.mdx`, update `profile.mdx` + `meta.json`, edit constitution. After Phase 5, `pnpm run quality-gate` green across the repo; new image rebuild successful.
6. **Phase 6 — Hot-reload integration check.** A single integration test that touches a knowledge file under a running watcher and asserts on the log stream. After Phase 6, the regression-guard exists for future churn.

Per [[../../learnings/bind-mount-rename-coupled-to-container-rebuild]], operators on running profiles need `zeno restart <profile> --build` after the new image lands — the bind mount + the worker loader both have to be in place before the container can pick up the new layout.

---

## Risks during execution

| Risk | Mitigation |
|---|---|
| The `@zeno/knowledge` package surfaces a missing `appdeps` declaration somewhere (per [[../../learnings/appdeps-growth-propagates-to-tests]]). | Run `pnpm run quality-gate` from repo root at every phase boundary; resolve hits as they come. |
| The CLI tsup bundle fails at runtime because `@zeno/knowledge` was forgotten in `noExternal` (per [[../../learnings/tsup-bundle-symlinked-cli]]). | Task 18 explicitly adds it. End-of-phase smoke test runs `node apps/cli/dist/index.js knowledge --help`. |
| The worker Docker image is missing the new package because the Dockerfile wasn't updated (per [[../../learnings/workspace-node-modules-in-docker]]). | Task 21 adds the three COPY lines; Phase 5 forces a `--build` and verifies the container boots and emits a `knowledge_*` event. |
| Stale-detection on macOS uses second-precision mtimes that can tie when an edit lands within the same second as the index. | Acceptable: a tie means the index is treated as fresh; next edit a second later resolves it. Documented in scanner JSDoc. |
| The watcher fires for both `_index.md` edits (from `zeno knowledge index`) and underlying `.md` edits in the same batch. | Debounce window (250 ms) coalesces them into one dispatch. Tests assert the debounce. |
