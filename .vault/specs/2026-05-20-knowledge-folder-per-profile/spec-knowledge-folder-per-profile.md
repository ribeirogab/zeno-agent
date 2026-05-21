---
status: draft
feature: knowledge-folder-per-profile
created: 2026-05-20
shipped: null
---
# Per-Profile Knowledge Folder + Auto-Index — Spec

**Status:** Draft
**Scope:** Add a per-profile `knowledge/` folder bind-mounted read-only into the worker container, with an auto-generated `_index.md` table of contents injected into the cached system prompt every turn. The folder is operator-authored long-form documentation about the operator, products, processes, glossary, team, habits, projects — context the agent should treat as ambient. Tracks GitHub issue [#90](https://github.com/ribeirogab/zeno-agent/issues/90).

## Context

A Zeno instance today has exactly two surfaces of persistent context that reach the agent:

- `agent/SOUL.md` — shared baseline identity (mission, connector model, safety rules) — same across all profiles.
- `profile/AGENTS.md` — per-instance operating manual (rules, skills to invoke, channel conventions, language defaults) — introduced by spec [[../2026-05-20-agents-md-per-instance/spec-agents-md-per-instance|0086]].

Both files are loaded deterministically into the cached system prompt by `buildSystemPrompt(soul, agents)` in `apps/worker/src/agent/system-prompt.ts`. The pattern works because injection happens in cache, not via probabilistic SDK skill auto-load — see [[../../learnings/system-prompt-injection-beats-skill-autoload]].

The problem this spec solves: AGENTS.md is for **declarative rules**, not long-form documentation. Anything an operator wants the agent to know about their company, products, processes, projects, glossary, team, habits — they have to re-explain in every conversation, or pollute AGENTS.md until it stops being a manual. This is the same friction `CLAUDE.md` solves for Claude Code: a folder of markdown the agent reads automatically.

This spec adds `knowledge/` as a third surface: a folder of markdown files the operator drops in whatever layout makes sense. The agent sees a compact table of contents in the cached system prompt every turn (via `_index.md`) and reads individual files on demand via the Read tool when their title/description match the request.

The feature must scale across very different operators without prescribing structure:

- A solo user might have 5 files: `about-me.md`, `my-projects.md`, `habits.md`, `goals.md`, `current-focus.md`.
- Two friends working on a side project might have 3 files describing the project, their roles, and recent decisions.
- A small company (FN-sized) might have `team.md`, `products.md`, `glossary.md`, `processes.md`.
- A large company might have nested folders: `engineering/`, `products/`, `policies/`, `people/`, each with multiple files.

Same mechanism, every scale.

Knowledge files extend the agent-config markdown lingua franca documented in [[../../learnings/workspace-markdown-files-pattern]]: `SOUL.md` (shared identity), `AGENTS.md` (per-instance operating manual), `SKILL.md` (installed playbooks), and now `knowledge/**/*.md` (operator-authored ambient context).

Related learnings:

- [[../../learnings/system-prompt-injection-beats-skill-autoload]] — why every-turn cached injection beats SDK skill auto-load for content the agent must always be aware of.
- [[../../learnings/bind-mount-rename-coupled-to-container-rebuild]] — bind-mount source changes require container restart; informs the watcher design.
- [[../../learnings/hermes-prompt-caching-invariants]] — cache stability invariants that constrain how the knowledge block is composed.
- [[../../learnings/claude-sdk-settings-sources-skills]] — SDK preset shape invariant; knowledge block must NOT be confused with the SDK skill surface.
- [[../../learnings/workspace-markdown-files-pattern]] — the broader pattern this spec extends.

Related specs:

- [[../2026-05-20-agents-md-per-instance/spec-agents-md-per-instance|0086 — AGENTS.md per-instance]] — established the per-profile-file-into-cached-system-prompt pattern that this spec extends from a single file to a folder + auto-index.

## Problem Statement

`AGENTS.md` is the wrong surface for long-form documentation. Three concrete consequences:

1. **AGENTS.md bloat erodes its purpose.** AGENTS.md is meant to be a tight operating manual the agent re-reads every turn. When operators stuff company descriptions, product details, glossary entries, or process runbooks into it, the file grows multi-page, the prompt cache pays the cost on every turn, and the rules (which must be applied) lose visual prominence next to the docs (which are reference).
2. **No persistent operator-authored context.** Anything the operator wants the agent to know about their world — their projects, their team, their habits, what their products do — must be re-explained in every conversation or encoded as rules in AGENTS.md (wrong shape). There is currently no read-mostly, scan-once-and-deep-dive-on-demand surface.
3. **Conceptual gap with reality.** Real operators have a layered context — declarative rules (AGENTS.md) and ambient knowledge (everything else). Today only the first surface exists. The second is hand-rolled per conversation, lossy, and not portable across restarts.

## Non-Goals

- **No dashboard browser page.** A read-only tree + markdown renderer for the knowledge folder is a separate issue. This spec ships the runtime mechanism + CLI surface only.
- **No graph view, no Obsidian-style backlink visualization.** Out of scope.
- **No memory feature.** This is operator-authored static documentation. Agent-authored runtime notes (facts learned during conversations) are a separate, unrelated feature.
- **No sweep / GC of knowledge files.** Operator manages the folder. Worker never writes to it; CLI never deletes from it.
- **No strict frontmatter validation.** Every frontmatter field is optional and the scanner falls back gracefully. No schema validation, no warning on missing fields beyond what `zeno knowledge index` already reports (unresolved related links).
- **No bootstrap / interview skill that seeds the folder.** Operator writes their own knowledge. A future skill that interviews the operator and drafts initial files is a separate feature.
- **No REST API for knowledge.** No new routes in `apps/api`. CLI is the only read/write surface. The dashboard browser issue, when scoped, will design its API together.
- **No edit-via-`$EDITOR` integration.** Operator edits via their own editor / Finder / IDE. CLI commands are conveniences: list, open the folder, regenerate the index.
- **No implicit folder-as-tag.** Tags come only from frontmatter `tags: []`. The folder structure shows up in `## Files` (tree) — not duplicated into `## By tag`.
- **No multi-profile knowledge sharing.** Each profile has its own folder; profiles never see each other's knowledge.
- **No edits to shipped specs in `.vault/specs/`.** Shipped specs are immutable per project convention.

## Constraints

- **Worker runtime is Docker-only.** Files are read from `/app/knowledge/` (read-only bind mount of `~/.zeno/profiles/<profile>/knowledge/`).
- **Read-only mount from the worker's perspective.** Worker never writes to `/app/knowledge/`. Index regeneration happens host-side via the CLI (writes to `~/.zeno/profiles/<profile>/knowledge/_index.md`).
- **Prompt-cache invariant.** The combined system prompt (SOUL + AGENTS + knowledge block) must remain stable across turns to keep the Anthropic prompt-cache warm. The knowledge block is rebuilt only on watcher events; per-turn user-specific context still goes in the user message side via `[slack_context]`.
- **Hard cap of 8 KB on the injected knowledge block.** When the rendered index exceeds the cap, the block is truncated and the worker appends a literal `(N files truncated — use Read tool with \`ls /app/knowledge\` for full list)` line. The cap protects cache cost predictability across instances.
- **Quality-gate must pass green.** `pnpm run quality-gate` stays green at commit time across all workspaces. No partial states.
- **No skips of pre-commit hooks.** Hooks are not bypassed (per global rule and constitution).
- **No real identifiers in committed content.** Default templates, docs, and the constitution edit stay sanitized per [[../../rules/sanitization]]. Knowledge folders themselves live under `~/.zeno/profiles/<name>/` (gitignored, off-repo).
- **Filename-prefix ignore rule.** Scanner ignores any file or directory whose basename starts with `_`. This covers `_index.md`, `_template.md`, and any operator-defined `_drafts/`, `_archive/` directories. The rule is uniform — there is no special-case for `_index.md` alone.
- **No fragile body parsing.** The description body-fallback rule is: first paragraph after the frontmatter (skipping headings), truncated to 120 characters with an ellipsis if longer. No multi-paragraph extraction, no markdown-stripping beyond removing leading `#` heading lines.
- **`related:` is wikilink-style by slug.** Each item is the file basename without `.md`; the renderer resolves it by searching `**/*.md` under the knowledge root. Ambiguous slugs require a path-prefix disambiguation (`engineering/stack` instead of `stack`).
- **Workspace package wiring.** The new `@zeno/knowledge` package must:
  - be listed in `noExternal` of `apps/cli/tsup.config.ts` so the symlinked CLI bundle stays self-contained (per [[../../learnings/tsup-bundle-symlinked-cli]]);
  - have its `node_modules/` copied into the worker Docker runtime image (per [[../../learnings/workspace-node-modules-in-docker]]);
  - use `moduleResolution: "NodeNext"` in its `tsconfig.json` — packages use NodeNext, apps use Bundler (per [[../../learnings/moduleresolution-split-worker-vs-dashboard]]).
- **Hot-reload state freshness.** The `onKnowledgeChanged` callback handler must re-invoke `loadKnowledgeBlock()` on every fire — never capture the block content at boot (per [[../../learnings/hot-reload-needs-getter-not-snapshot]]). The system-prompt rebuild path reads from a getter, not a snapshot.

## User Stories / Scenarios

1. **Operator creates a new profile and seeds knowledge.** Operator runs `zeno profile create alpha`. The CLI scaffolds `~/.zeno/profiles/alpha/knowledge/_index.md` (empty placeholder) and `~/.zeno/profiles/alpha/knowledge/_template.md` (frontmatter-only skeleton). Operator copies `_template.md` to `about-me.md`, fills in title + description + body, runs `zeno knowledge index alpha`. The CLI regenerates `_index.md` to list `about-me.md`. Operator runs `zeno start alpha`. Worker boots, finds `_index.md` non-stale, injects its content as a `# Knowledge available` block in the system prompt.
2. **Operator edits a knowledge file with their editor.** Operator opens `~/.zeno/profiles/alpha/knowledge/about-me.md` in VS Code, edits, saves. The worker's `ProfileWatcher` fires a debounced `knowledge` event. Worker re-evaluates the index (file mtime now > `_index.md` mtime → stale → live-scan + render in-memory) and rebuilds the system prompt. Next turn uses the new content. Cache invalidates and re-warms.
3. **Operator regenerates the index after a batch of edits.** Operator added three new files and renamed one. Operator runs `zeno knowledge index alpha`. CLI prints `Indexed 8 files (3.2 KB) in ~/.zeno/profiles/alpha/knowledge/`. If any `related:` slug fails to resolve, CLI prints `Warning: 2 unresolved related links in processes/release-flow.md: ci-typo, on-call-old`. `_index.md` is overwritten on disk. Worker watcher fires on the change, picks up the fresh `_index.md`, system prompt rebuilds with the updated listing.
4. **Operator inspects what the agent sees.** Operator runs `zeno knowledge list alpha`. CLI prints each file: relative path, title (from frontmatter / H1 / filename), tags (from frontmatter), size. Operator runs `zeno knowledge open alpha`. The OS file browser opens at `~/.zeno/profiles/alpha/knowledge/`.
5. **Agent uses the knowledge block during a turn.** A user asks the FN-profile agent "what's the release flow here?" in Slack. The cached system prompt contains the `# Knowledge available` block, which lists `processes/release-flow.md — How code goes from main to production`. The agent recognizes the match, calls the Read tool on `/app/knowledge/processes/release-flow.md`, reads the body, composes a reply.
6. **Operator overflows the 8 KB cap.** Operator has 250 knowledge files. CLI regenerates `_index.md` (full, on disk, ~22 KB). Worker reads `_index.md`, detects it exceeds 8 KB, truncates the rendered block at 8 KB, appends `(N files truncated — use Read tool with \`ls /app/knowledge\` for full list)`. Worker logs `knowledge_index_truncated` with `originalBytes` and `droppedCount`. Agent still has Read access to the full file tree.
7. **Operator deletes `_index.md` accidentally.** Worker watcher fires `knowledge` event. Worker tries to read `/app/knowledge/_index.md`, gets ENOENT, falls back to live-scan, renders in-memory, injects. Worker logs `knowledge_index_missing` (warn) with the scan duration. Next `zeno knowledge index` regenerates the file on disk.

## Acceptance Criteria

Each criterion is a binary, observable check that someone other than the implementer can verify in under a minute.

### Package `@zeno/knowledge`

- [ ] `packages/knowledge/` exists with `package.json` (name: `@zeno/knowledge`), `tsconfig.json`, and `src/index.ts`.
- [ ] `packages/knowledge/src/index.ts` exports `scanKnowledge(rootPath: string): FileMeta[]` returning an array sorted by relative path (case-insensitive). `FileMeta` includes `{ relPath, title, description, tags, related, bytes, mtimeMs }`.
- [ ] `packages/knowledge/src/index.ts` exports `renderIndex(files: FileMeta[], opts: { generatedAt: Date }): { markdown: string; unresolvedRelated: Array<{ file: string; slug: string }> }`.
- [ ] Scanner skips any file or directory whose basename starts with `_` (verified by unit test with fixture containing `_index.md`, `_template.md`, `_drafts/notes.md`, `kept.md` — only `kept.md` appears in output).
- [ ] Title fallback chain is `frontmatter.title → first H1 → filename without .md` (verified by 3-case unit test).
- [ ] Description fallback chain is `frontmatter.description → first paragraph after frontmatter (skipping headings, truncated at 120 chars with ellipsis) → empty string` (verified by 3-case unit test including the 120-char truncation).
- [ ] Tags come from `frontmatter.tags` only — no body scan, no implicit folder tags (verified by unit test: file at `engineering/stack.md` with `tags: [a]` produces tags `[a]`, not `[a, engineering]`).
- [ ] `related:` resolution: each slug matches a file by basename without extension under the knowledge root; path-prefix disambiguates when multiple match; unresolved slugs appear in `unresolvedRelated` (verified by unit test).
- [ ] `renderIndex` output starts with the literal banner `<!-- AUTO-GENERATED by \`zeno knowledge index\` — do not edit by hand. -->` followed by a blank line.
- [ ] `renderIndex` output contains a `# Knowledge Index` heading, a `Last refreshed: <ISO timestamp>` line, a `Total: <N> files · <size>` line, a `## Files` section with a nested-folder tree, and a `## By tag` section if any file has tags (omitted otherwise).
- [ ] `renderIndex` does NOT emit `_index.md`, `_template.md`, or any `_`-prefixed entry in `## Files` (round-trip verified).
- [ ] `pnpm --filter @zeno/knowledge test` is green.

### Worker

- [ ] `apps/worker/src/agent/system-prompt.ts` exports `buildSystemPrompt(soul: string | null, agents: string | null, knowledgeBlock: string | null): string`. When `knowledgeBlock` is non-null and non-empty, the return value contains `\n\n# Knowledge available\n\n${knowledgeBlock}` appended after the AGENTS block. When null/empty, the knowledge section is omitted entirely (no empty heading).
- [ ] `apps/worker/src/knowledge/loader.ts` (new file) exports `loadKnowledgeBlock(): { content: string; truncated: boolean; originalBytes: number; droppedCount: number }`. It reads `/app/knowledge/_index.md` if present **and** not stale (no `**/*.md` file under `/app/knowledge/` has `mtimeMs` greater than the `_index.md` `mtimeMs`); otherwise it calls `scanKnowledge('/app/knowledge') + renderIndex(...)` in-memory. It applies the 8 KB cap and, when exceeded, truncates the content to the nearest line break ≤ 8 KB and appends a literal `\n\n(N files truncated — use Read tool with \`ls /app/knowledge\` for full list)` line. It returns `{ truncated, originalBytes, droppedCount }` for logging.
- [ ] On worker boot, the worker emits one of these structured-log events for the knowledge block, exactly one per boot: `knowledge_index_loaded` (with `bytes`, `fileCount`), `knowledge_index_missing` (warn, with `bytes`, `fileCount` from the scan), `knowledge_index_stale` (warn, with `bytes`, `fileCount`, `stalestMtime`). When the block is truncated, an additional `knowledge_index_truncated` (warn) event fires with `originalBytes` and `droppedCount`.
- [ ] When `/app/knowledge/` does not exist at all (older profile without the folder), the worker emits a single `knowledge_dir_absent` info event and skips the knowledge block (system prompt has no `# Knowledge available` section). Worker still boots.
- [ ] `apps/worker/src/profile/watcher.ts` `classify()` returns a new group `'knowledge'` for any `.md` file whose path matches `^knowledge/.+\.md$` under the `profile` source (verified by unit test). `ProfileWatcherOptions` gains an `onKnowledgeChanged?: () => void` callback that is dispatched on the debounced `'knowledge'` group.
- [ ] The worker boot wires `onKnowledgeChanged` to a handler that re-runs `loadKnowledgeBlock()` and rebuilds the system prompt via the same path used by `onPromptFilesChanged`.

### Docker mount

- [ ] `apps/cli/src/lib/orchestrator/docker.ts` adds a HostConfig bind entry `{ Type: 'bind', Source: <host path to profile's knowledge dir>, Target: '/app/knowledge', ReadOnly: true }` to the container spec used by `start` / `restart`.
- [ ] When the knowledge folder does not exist on the host (older profile created before this spec), the CLI creates it (empty folder) before starting the container, so the bind mount never fails with ENOENT.

### Package `@zeno/knowledge` in worker + CLI dependencies

- [ ] `apps/worker/package.json` lists `@zeno/knowledge` as a workspace dependency.
- [ ] `apps/cli/package.json` lists `@zeno/knowledge` as a workspace dependency.
- [ ] `pnpm install` from repo root succeeds; turborepo build graph picks up the new package.

### CLI

- [ ] `zeno knowledge` is registered as a top-level command tree in the CLI. `zeno knowledge --help` lists exactly three subcommands: `list`, `open`, `index`. There is no `edit` subcommand.
- [ ] `zeno knowledge list <profile>` prints one line per file with `<relPath>  <title>  [<tags joined by ,>]  <bytes>B`. When the folder is empty or contains only `_`-prefixed files, prints `No knowledge files in profile '<profile>'.` and exits 0.
- [ ] `zeno knowledge open <profile>` launches `open` (macOS), `xdg-open` (Linux), or `explorer` (Windows) with the absolute path to the profile's knowledge folder. Exits 0 on launch; exits 1 with a clear error if the platform is unsupported.
- [ ] `zeno knowledge index <profile>` calls `scanKnowledge + renderIndex` against the profile's host knowledge folder, writes the result to `~/.zeno/profiles/<profile>/knowledge/_index.md`, and prints `Indexed <N> files (<size>) in ~/.zeno/profiles/<profile>/knowledge/`. When any `related:` slug is unresolved, the command also prints `Warning: <K> unresolved related links:` followed by one line per `<file>: <slug>`. Exit code remains 0.
- [ ] `zeno profile create <name>` materializes `~/.zeno/profiles/<name>/knowledge/_index.md` (using the placeholder content shipped with the templates) and `~/.zeno/profiles/<name>/knowledge/_template.md`. Output gains a `  Knowledge:  ~/.zeno/profiles/<name>/knowledge/` line after the `AGENTS.md:` line.
- [ ] `zeno profile show <name>` prints a `Knowledge:  <N> files · <bytes>` line (using the same scanner). When the folder is absent, prints `Knowledge:  (not created)`.

(`zeno profile delete <name>` already removes the entire `~/.zeno/profiles/<name>/` directory recursively via `rmSync(profileDir(name), { recursive: true, force: true })` in `apps/cli/src/commands/profile-delete.ts`. The knowledge folder is removed as a side-effect of existing behavior; no new AC required.)

### Templates

- [ ] `templates/profile/knowledge/_template.md` exists with the exact content agreed in this spec (see "Template content" below). Body is empty after the closing `---`.
- [ ] `templates/profile/knowledge/_index.md` exists with the exact placeholder content agreed in this spec (see "Index placeholder content" below).
- [ ] `apps/cli/src/lib/templates.ts` `materializeProfile()` copies both template files into `~/.zeno/profiles/<name>/knowledge/` during `zeno profile create`.

### Docs

- [ ] `apps/docs/content/docs/knowledge.mdx` exists and covers: (a) what knowledge is, (b) folder structure + filename ignore rule (`_*`), (c) frontmatter shape (all fields optional), (d) the four operator scales (solo / friends / small company / large company) with at least one concrete example per scale, (e) how the agent consumes it (index in system prompt, Read on demand), (f) the three CLI commands. The doc does NOT mention the Read capability prerequisite.
- [ ] `apps/docs/content/docs/profile.mdx` gains a paragraph in the walkthrough mentioning the knowledge folder + the three CLI commands.
- [ ] `apps/docs/content/docs/meta.json` includes `"knowledge"` in the `pages` array under the `---Concepts---` separator.

### Constitution

- [ ] `.vault/constitution.md` line ~47 "no host filesystem access beyond mounted volumes (`workspace`, `AGENTS.md` read-only)" is updated to include `knowledge/` (read-only).
- [ ] `.vault/constitution.md` line ~88 "Runtime context the agent actually needs is narrow: the per-instance operating manual (`AGENTS.md`, mounted), the system prompt (built at boot), and the MCP tools exposed by the connectors..." is updated to list four runtime context sources: per-instance operating manual (`AGENTS.md`, mounted), the system prompt (built at boot), **the knowledge folder (`knowledge/`, mounted read-only with `_index.md` injected into the system prompt)**, and the MCP tools exposed by the connectors. No other constitutional surface is touched in this spec.

### Hot-reload regression check

- [ ] Manually editing `~/.zeno/profiles/<profile>/knowledge/foo.md` while the worker is running causes (within `debounceMs + 1s`) the worker to emit a `knowledge_index_stale` event followed by a system-prompt rebuild log line. Verified by writing a single integration test that touches the file, sleeps `debounceMs * 2`, and asserts on the log stream.

### End-to-end

- [ ] `git grep -E '/app/knowledge'` returns matches in `apps/worker/src/`, `apps/cli/src/lib/orchestrator/`, and `apps/docs/content/docs/knowledge.mdx`.
- [ ] `pnpm run quality-gate` is green at HEAD of the feature branch.

### Template content (exact)

`templates/profile/knowledge/_template.md`:

```markdown
---
# Display name for this note. Optional. When absent the worker uses the
# first `# Heading` in the body, or the filename if there is no heading.
title: Release flow

# One-line summary shown next to the file path in _index.md and surfaced
# in the system prompt. Optional. When absent the worker uses the first
# paragraph of the body (truncated to 120 chars).
description: How code goes from main to production

# Tags for grouping this note across folder boundaries. Optional.
# No nested/hierarchical syntax — flat list of strings.
tags: [process, deploy]

# Other knowledge notes this one references. Each item is the .md slug
# without extension (wikilink style). Worker resolves `stack` → `stack.md`
# anywhere in `knowledge/`. Use a path prefix when ambiguous
# (e.g. `engineering/stack` if multiple `stack.md` exist in different folders).
related: [stack, ci-cd, on-call]
---
```

### Index placeholder content (exact)

`templates/profile/knowledge/_index.md`:

```markdown
<!-- AUTO-GENERATED by `zeno knowledge index` — do not edit by hand. -->

# Knowledge Index

Last refreshed: never
Total: 0 files · 0 B

## Files

_No knowledge files yet. Copy `_template.md` to start, then run `zeno knowledge index` to refresh this listing._
```

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Operator edits `_index.md` by hand expecting changes to stick; next `zeno knowledge index` or any `.md` change overwrites it. | `_index.md` ships with a clear `<!-- AUTO-GENERATED ... do not edit by hand. -->` banner. Documented in `knowledge.mdx`. No technical enforcement — operator can still touch the file; the stale-detection path treats it as cache. |
| Live-scan on every reload adds boot/turn latency for operators with hundreds of files. | Scanner is pure FS walk + small frontmatter parse — measured under 50 ms for 200 files in early test on local SSD. If a real instance exceeds 250 ms scan time, a learning gets filed and we add an LRU memoization keyed by `(_index.md mtime, file count)`. Not added preemptively. |
| 8 KB cap surprises operators who write long descriptions and watch the listing get truncated. | Truncation appends a literal line `(N files truncated — use Read tool with \`ls /app/knowledge\` for full list)` so the agent and operator both see the cause. `knowledge_index_truncated` warn log surfaces it in container logs. Documented in `knowledge.mdx`. |
| Watcher fires too eagerly on subdirectory churn (operator uses `_drafts/` heavily). | Scanner skips `_`-prefixed paths, but watcher events still fire for them. `classify()` rejects `_`-prefixed files so the `knowledge` group never dispatches for drafts. Verified by unit test. |
| `related:` slug ambiguity produces wrong resolution silently. | Resolution rule: if more than one file matches a bare slug, the slug is treated as unresolved and surfaced in the CLI warning. Operator must use the path-prefix form. Verified by unit test. |
| Bind mount fails on profile created before this spec (no `knowledge/` folder exists on host). | CLI `start` / `restart` ensures the folder exists (creates an empty one) before invoking the orchestrator. Verified by acceptance criterion. |
| Description body-fallback misfires on files that start with a markdown table, code block, or HTML — picks the wrong "first paragraph". | The rule is intentionally simple: first non-empty line after frontmatter that does not start with `#`. Code-block fences, table rows, and HTML get picked through as-is and truncated; this is acceptable because description is advisory, not load-bearing. Operator can always set `description:` explicitly. |
| Adding `@zeno/knowledge` as a workspace dependency surfaces missing `appdeps` declarations elsewhere ([[../../learnings/appdeps-growth-propagates-to-tests]]). | Run full `pnpm run quality-gate` before merge; fix any propagation surfaced by the new package boundary. |
| Docker bind mount permissions differ on macOS vs Linux (uid mapping). | Mount is read-only from the container — no write permission concerns. Read permissions are inherited from the host user; profile dirs are operator-owned. Verified manually during PR review. |
| Future `_index.md` schema change (new field, different banner) silently breaks worker parsing. | Worker parses `_index.md` as opaque markdown for injection — it does not parse fields out of it. Schema changes affect `renderIndex` only. No silent breakage path. |
| Operator with Read tool disabled in `/settings/agent-capabilities` sees the knowledge index in the system prompt but the agent cannot open the underlying files — silent UX failure. | Acknowledged limitation. The index alone (titles + descriptions + tags) still answers many ambient-context questions. If a future operator hits this and files a follow-up, add a doc callout then. Not gated on this spec. |
| `@zeno/knowledge` added as a workspace dep without updating CLI's tsup `noExternal` list breaks the symlinked CLI bundle at runtime. | Constraint explicitly requires the noExternal update; quality-gate exercises the bundled CLI; see [[../../learnings/tsup-bundle-symlinked-cli]]. |
| `@zeno/knowledge` added as a worker dep without updating the Docker COPY step leaves the new package missing from the runtime image. | Constraint explicitly requires the Docker-image copy; verified by `zeno start <profile>` smoke-test on a fresh image; see [[../../learnings/workspace-node-modules-in-docker]]. |

## Open Questions

None. All scope decisions are locked in this spec.
