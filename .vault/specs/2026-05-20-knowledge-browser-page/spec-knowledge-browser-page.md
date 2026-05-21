---
status: draft
feature: knowledge-browser-page
created: 2026-05-20
shipped: null
issue: 91
---
# Knowledge Browser Page — Spec

**Status:** Draft
**Scope:** Add a read-only `/knowledge` route in the profile dashboard that surfaces the contents of the profile's `knowledge/` folder as a tree + markdown viewer with resolvable wikilinks. API surface lives in `apps/api`; rendering lives in `apps/dashboard`. No edit, no delete, no create.

## Context

Spec [[../2026-05-20-knowledge-folder-per-profile/spec-knowledge-folder-per-profile|2026-05-20-knowledge-folder-per-profile]] shipped the per-profile `knowledge/` folder mounted read-only into the worker container, with an auto-generated `_index.md` injected into the cached system prompt. The only way to inspect what the agent sees as "knowledge" today is to navigate the host filesystem with `ls`/`cat` or the operator's editor.

This spec adds the dashboard-side viewer. Operators get a centralized surface (alongside logs, sessions, connectors) to audit what the agent is grounding on, navigate cross-references between notes, and sanity-check rendered markdown without leaving the dashboard. Edit-from-dashboard is deferred — knowledge edits are higher-cost than `AGENTS.md` edits (more files, more cross-references) and belong in the operator's editor with git diffing.

Foundations already in place from spec 2026-05-20-knowledge-folder-per-profile:

- `~/.zeno/profiles/<name>/knowledge/` exists on host; bind-mounted read-only at `/app/knowledge` inside the worker container.
- `apps/api` (Hono) runs in the same container as the worker and can read `/app/knowledge` directly.
- `@zeno/knowledge` package exposes `scan`, `parseFrontmatter`, `extractTitle`, `extractDescription`, `resolveRelated`. Pure modules, Node-safe.

## Problem Statement

Operators have no UI to browse what the agent considers "knowledge" for the current profile. Inspecting the folder requires leaving the dashboard for the host filesystem, which:

- Excludes operators uncomfortable on a terminal.
- Hides cross-reference structure — operators can read raw markdown but cannot follow `[[wikilinks]]` like the agent's mental model implies.
- Provides no rendering — frontmatter, lists, code fences appear as raw markdown rather than the structured surface the agent perceives.
- Forces context-switching between dashboard tabs (logs, sessions) and a terminal/editor to verify what the agent is grounding on.

Add a read-only browser at `/knowledge` so operators can audit, navigate, and verify the knowledge surface from the same dashboard they use for everything else.

## Non-Goals

- **Editing from the dashboard.** No textarea, no save button, no new-file button, no delete. Operator edits via `$EDITOR`/IDE/git.
- **Interactive graph view.** Tracked separately as issue #92.
- **Search across the knowledge base.** Browsing UX first; search after.
- **Diff view between revisions.** Operator uses git for revision diffs.
- **Image/asset rendering.** v1 serves only `.md` files. Notes with `![](./img.png)` show broken-image alt text. Adding an asset endpoint is deferred until an operator asks.
- **Mobile/responsive layout.** Dashboard is desktop-only today; this page follows that constraint.
- **`_index.md` regeneration trigger.** Tree reflects whatever is on disk. Operator regenerates the index with `zeno knowledge index <profile>` as before.
- **Watching files on the host for changes.** UI refreshes on window focus (react-query default), not via fs watcher or SSE.
- **3D graph mode, layout persistence, time-based playback.** Out of scope for this spec entirely; see #92 for graph follow-up.

## Constraints

- **Read-only.** API endpoints are `GET` only. No `PUT`/`POST`/`DELETE`. Server enforces `.md` extension + path-traversal guard.
- **Same container as worker.** `apps/api` reads `/app/knowledge` — the read-only bind mount established by spec 2026-05-20-knowledge-folder-per-profile. No new mount, no host-path lookup.
- **No new mount.** Re-uses the existing knowledge bind from the worker compose. No Dockerfile or CLI change required beyond wiring.
- **Stack already chosen.** Hono for API routes; TanStack Router + react-query in the dashboard; biome lint; vitest tests. Adding a markdown renderer dependency requires a learning note per `[[../../constitution|constitution]]` ("Do not add dependencies without first writing a learning or spec explaining the decision").
- **Path-traversal hardening is mandatory.** Any handler that accepts a `path` from the client must resolve to an absolute path under `/app/knowledge` and reject otherwise. Captured under `[[../../rules/sanitization|sanitization]]` as a security-relevant boundary.
- **Bundle budget.** Dashboard SPA. Markdown renderer + wikilink plugin ≤ 80 KB gzipped delta over the current bundle. `react-markdown@9` + `remark-gfm@4` measured ≈ 38 KB gzipped together; safe.
- **No external network.** Markdown renderer must work fully offline — no remote CDN, no GitHub/Mermaid live calls.

## User Stories / Scenarios

1. **Audit current knowledge surface.** Operator opens dashboard → clicks "knowledge" in sidebar → sees tree of all `.md` files in `~/.zeno/profiles/<active>/knowledge/`. Clicks a file → sees rendered markdown on the right, breadcrumb path + last-modified + bytes + tags in the header.
2. **Follow a cross-reference.** Operator clicks `[[release-flow]]` inside a rendered note → URL changes to `?file=processes/release-flow.md`, viewer pane swaps to that file, tree auto-expands the `processes/` branch and highlights the file.
3. **Share a deep-link.** Operator copies `http://127.0.0.1:6101/knowledge?file=playbooks/security.md` and pastes into a chat. Recipient (with dashboard access) opens the URL and lands directly on that file.
4. **Spot a broken cross-reference.** Operator wrote `[[old-note-name]]` after renaming the file. In the viewer, the wikilink renders in a broken-link style (dimmed/red, not clickable) with tooltip "file not found". Operator opens the file in their editor, fixes the slug, refocuses the dashboard tab — viewer refetches and the link is now clickable.
5. **Inspect a meta file.** Operator wants to verify what `_index.md` looks like. Toggles "show meta files" → `_index.md`, `_template.md`, and any `_drafts/` files appear in the tree. Toggle persists in `localStorage` so the choice survives reloads.
6. **New profile with empty knowledge folder.** Operator on a fresh profile (no notes yet, only `_template.md` + `_index.md` placeholder) opens `/knowledge`. With "show meta" off, sees empty-state copy with the host path. Toggles meta on, sees the two template files.
7. **Pasted bad URL.** Operator clicks `/knowledge?file=does-not-exist.md`. Tree loads normally; viewer pane shows "File not found" + "Clear selection" link.

## Acceptance Criteria

- [ ] `GET /api/knowledge/files` on a `/app/knowledge` containing `foo.md`, `processes/release-flow.md`, `_index.md` returns 200 with body shape `{ files: [{path, title, bytes, mtime, tags}], totalBytes: <number>, totalFiles: 3 }`. All three files appear (server returns meta files; UI is what filters).
- [ ] `GET /api/knowledge/file?path=foo.md` returns 200 with body `{ path: "foo.md", content: <raw md WITHOUT frontmatter>, frontmatter: <parsed object or null>, title: <string>, mtime: <ISO8601>, bytes: <number>, wikilinks: {<slug>: <resolved path or null>} }`.
- [ ] `GET /api/knowledge/file?path=../../etc/passwd` returns 400 with body `{error: "invalid_path"}` and does not read the host file.
- [ ] `GET /api/knowledge/file?path=foo.txt` returns 400 with body `{error: "invalid_path"}`. Non-`.md` extension is rejected.
- [ ] `GET /api/knowledge/file?path=/absolute/path.md` returns 400 with body `{error: "invalid_path"}`.
- [ ] `GET /api/knowledge/file?path=does-not-exist.md` returns 404 with body `{error: "not_found"}`.
- [ ] A `.md` file with malformed YAML frontmatter (e.g. unbalanced quotes) returns 200 with `frontmatter: null` and `content` set to the entire file body including the raw frontmatter block; no 500.
- [ ] Sidebar lists "knowledge" as a primary nav item between existing items (placement decided at implementation time; documented in PR).
- [ ] Navigating to `/knowledge` with no `?file=` query renders the tree on the left and an empty-state viewer with copy that mentions the host path `~/.zeno/profiles/<name>/knowledge/`.
- [ ] Navigating to `/knowledge?file=processes/release-flow.md` renders the file's rendered markdown (H1, code block, list, table) in the viewer pane, with the tree auto-expanded so `release-flow.md` under `processes/` is visible and visually highlighted as selected.
- [ ] A `[[other-note]]` wikilink inside a rendered file becomes an `<a>` element whose `href` ends with `?file=other-note.md` (when `other-note.md` exists at the knowledge root) and a click on it updates the URL and viewer without a full page reload.
- [ ] A `[[nonexistent]]` wikilink renders as a `<span>` (or `<a>` without `href`) carrying a `data-broken="true"` attribute (or equivalent stable selector) and `title` attribute `"wikilink not found: nonexistent"`. It is not clickable.
- [ ] `_index.md`, `_template.md`, and any `_`-prefixed files/folders are absent from the tree when `localStorage.getItem("zeno.knowledge.showMeta")` is unset or `"false"`.
- [ ] Toggling "show meta files" causes those files to appear in the tree on the next render and writes `"true"` to `localStorage.zeno.knowledge.showMeta`; reloading the page preserves the toggle state.
- [ ] After editing a file with the dashboard tab unfocused and switching back to the tab, the viewer's rendered content reflects the new file body within one render cycle (verified by changing a paragraph and observing it post-focus).
- [ ] `pnpm run quality-gate` is green: biome, typecheck, all tests across workspaces.
- [ ] Dashboard production bundle delta caused by this feature is ≤ 80 KB gzipped over the pre-feature baseline (measured via `vite build` size output before/after).

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Path traversal via URL-encoded `..` or absolute path lets caller read host files outside `knowledge/`. | Resolve `requested` to absolute via `path.resolve(root, requested)` then reject unless `abs.startsWith(root + path.sep) || abs === root`. Also require `.md` suffix. Test the three attack shapes (`..`, absolute, non-md) explicitly. |
| Markdown renderer ships a remote-fetching plugin or trusts arbitrary HTML, opening XSS. | Use `react-markdown` defaults (no raw HTML allowed). `remark-gfm` is offline. No `rehype-raw`. Custom wikilink plugin transforms text nodes only, never passes through HTML. |
| @zeno/knowledge currently uses `node:fs` in `scan.ts`; importing the wikilink helpers into the browser would break the build. | Add `wikilink.ts` as a separate pure module exported from `@zeno/knowledge`. API consumes it server-side. Client never imports `@zeno/knowledge`; client receives `wikilinks` map pre-resolved from the API. |
| Large knowledge folders (hundreds of files) make the tree slow to mount. | Acceptable for v1: tree is rendered once, react-query caches the list. If profiling shows >100ms render, virtualize later — out of scope for v1. |
| Wikilink resolution is ambiguous (multiple files match bare slug). | Resolver returns `null` for ambiguous slugs, identical to existing `resolveRelated()` behavior. UI shows broken-link style with tooltip "ambiguous slug". One tooltip variant per cause. |
| Operator edits file in host filesystem while dashboard is in foreground. | Acceptable: stale view until window blur/focus or manual reload triggers refetch. Not a regression — this is consistent with the rest of the dashboard (logs, settings). |
| Dashboard built into a static SPA cannot proxy the API. | Existing dashboard already calls `apps/api` over the same host/port; new routes mount under the same Hono app with no proxy needed. |

## Open Questions

None.
