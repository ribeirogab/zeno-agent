---
tags:
  - moc
---
# Learnings — Map of Content

Atomic notes about Zeno's architecture, patterns, and gotchas. Categorized by tag.

Learnings here are specific to Zeno. Code style conventions live in `[[conventions|Conventions MOC]]`.

## `#concept` — Architecture and patterns

- [[../learnings/channel-vs-connector|Channel vs Connector — duas integrações externas, dois papéis]] — input/output adapter (constitution port) vs MCP tool surface (DB-managed). Slack é os dois. Princípio para qualquer integração nova.
- [[../learnings/channel-as-connector-cutover|Channels as connectors — cutover pattern]] — extending the connectors table with a `kind` discriminator instead of a parallel `channels` table; what worked, what to repeat for future channels.
- [[../learnings/lessons-for-zeno-from-openclaw-hermes|Lessons for Zeno from OpenClaw and Hermes]] — synthesis + strategic positioning + what to adopt/defer.
- [[../learnings/async-local-storage-for-sdk-callbacks|AsyncLocalStorage for per-call state in SDK callbacks]] — how `GuardedBackend` gives per-call context to the SDK's constructor-level `canUseTool` hook.
- [[../learnings/classifier-reuses-oauth-via-sdk-query|Classifier reuses OAuth via SDK query()]] — auxiliary LLM calls inside Zeno reuse the agent SDK with empty tools; no API key, no new dep.
- [[../learnings/workspace-markdown-files-pattern|Workspace markdown files pattern]] — SOUL.md, AGENTS.md, USER.md, MEMORY.md, SKILL.md as the emerging agent-config lingua franca.
- [[../learnings/system-prompt-injection-beats-skill-autoload|System-prompt injection beats skill auto-load for inviolable rules]] — SDK skill auto-trigger via description match is probabilistic; rules that must apply every turn belong in the cached system prompt (AGENTS.md), not in the skill body alone. Spec 2026-05-20.
- [[../learnings/tool-registry-autodiscovery-pattern|Tool registry with import-time auto-discovery]] — Hermes' elegant extension pattern.
- [[../learnings/gateway-daemon-vs-single-process|Gateway daemon vs single-process]] — when each wins; why Zeno stays single-process for now.
- [[../learnings/closed-learning-loop-self-improving-skills|Closed learning loop and self-improving skills]] — Hermes' bet; when it's worth adopting.
- [[../learnings/dm-pairing-allowlist-security|DM pairing / allowlist as first-class security]] — OpenClaw's pattern; when to enable in Zeno.
- [[../learnings/multi-agent-routing-channels-to-agents|Multi-agent routing — channels to agents]] — OpenClaw's pattern; triggers to adopt in Zeno.
- [[../learnings/slack-mcp-vs-bolt|Slack MCP server vs Slack Bolt]] — MCP is pull-only; still need Bolt for ingress.
- [[../learnings/mcp-github-server-status|GitHub MCP server status]] — moved to github/github-mcp-server; `gh` + Bash is simpler for MVP.
- [[../learnings/db-as-contract-pattern|DB is the contract between worker and API]] — zero IPC; every coordination goes through a SQLite table (commands, logs, sessions).
- [[../learnings/fire-and-forget-mutation-ux|Fire-and-forget mutation UX]] — API 204 + 1.5s invalidate, no command-status polling in the dashboard.
- [[../learnings/two-logger-bootstrap-pattern|Two-logger bootstrap pattern]] — boot logger (pre-DB, stdout only) + main logger (dbSink) inside `main()`.
- [[../learnings/shadcn-copy-not-library|shadcn primitives are code you own]] — hand-write the shape, audit per-file, never run the CLI in this repo.
- [[../learnings/structural-interface-across-packages|Structural interface across packages]] — declare minimal interface in consumer; producer satisfies by shape; no cross-package runtime dep.
- [[../learnings/tailwind-v4-source-directive-cross-package|Tailwind v4 `@source` directive for cross-package components]] — workspace packages self-register their content globs in `tokens.css`.
- [[../learnings/lowercase-pill-convention|Lowercase pill convention]] — status pills lowercase, kickers and filter chips uppercase.
- [[../learnings/optimistic-mutation-pattern|Optimistic-mutation primitive over TanStack useMutation]] — declarative wrapper handles snapshot/restore/invalidate; each mutation becomes ~10 lines of config.
- [[../learnings/docker-multi-profile-via-compose|Multi-profile isolation via Docker Compose]] — same image, N compose files, N profile dirs; shared claude_home, isolated workspace volumes.
- [[../learnings/citty-cli-gotchas|citty CLI gotchas]] — subcommand flags must follow the subcommand name; no native positional varargs (use `rawArgs` + manual flag stripping for passthrough commands).
- [[../learnings/citty-0.1.6-multi-flag-clobbers-repeated-args|citty 0.1.6 clobbers repeated string-typed flags]] — a `type: 'string'` flag passed multiple times keeps only the LAST occurrence. Scan `rawArgs` yourself to recover every value. Surfaced by the first multi-secret connector (MySQL, spec 2026-05-19-connector-mysql).
- [[../learnings/tsup-bundle-symlinked-cli|tsup must bundle deps for symlinked CLIs]] — `noExternal: ['citty', ...]` is required so the bundle is self-contained; externalized deps break when the dist file is moved or `node_modules` is pruned.
- [[../learnings/skill-scoped-credentials-pattern|Skill-scoped credentials pattern]] — **superseded by spec 0049**: skills no longer exist at runtime; credentials are connector-scoped (DB-stored, dashboard-managed).
- [[../learnings/github-app-token-rotation|GitHub App token rotation]] — JWT → installation token exchange; 55-min refresh loop. **Spec 0051 update:** the per-installation operator-picked envVar field was retired; the github-mcp-server subprocess receives `GITHUB_PERSONAL_ACCESS_TOKEN` synthesized from the cached token.

## `#reference` — Environment and commands

- [[../learnings/openclaw-architecture|OpenClaw architecture]] — TypeScript monorepo + gateway daemon + 22+ channels; full reference.
- [[../learnings/hermes-architecture|Hermes Agent architecture]] — Python, self-improving skills, serverless-ready; full reference.
- [[../learnings/claudeclaw-claude-code-plugin-pattern|ClaudeClaw — OpenClaw-lite as a Claude Code plugin]] — lightweight alternative, closest comparable to Zeno.
- [[../learnings/agent-skills-open-standard|Agent Skills open standard (agentskills.io)]] — SKILL.md format, portability across agents.
- [[../learnings/profile-isolation-via-env-var|Profile isolation via env var]] — Hermes' HERMES_HOME pattern for multi-instance.
- [[../learnings/claude-agent-sdk-typescript|Claude Agent SDK (TypeScript)]] — `query()` API, options, OAuth via env.
- [[../learnings/claude-sdk-jsonl-transcript-shape|Claude Agent SDK JSONL transcript shape]] — where session transcripts live + parser strategy.
- [[../learnings/claude-code-oauth-token|Claude Code OAuth token]] — `claude setup-token` workflow for `CLAUDE_CODE_OAUTH_TOKEN`.
- [[../learnings/claude-code-cli-headless|Claude Code CLI — headless flags]] — `-p`, `--bare`, output formats.
- [[../learnings/claude-sdk-settings-sources-skills|Claude Agent SDK settingSources for skill auto-discovery]] — SDK does NOT auto-load skills; `settingSources: ['user']` is required.
- [[../learnings/slack-bolt-socket-mode|Slack Bolt Socket Mode]] — `@slack/bolt@4.7` minimal setup + scopes.
- [[../learnings/gh-repo-list-json|gh repo list with --json]] — fields and auth via `GH_TOKEN`.
- [[../learnings/node-lts-current|Node.js LTS status]] — Node 24 is current Active LTS (as of 2026-04).
- [[../learnings/docker-node-image-variants|Node.js Docker image variant]] — `node:24-slim` is the right default for Zeno.
- [[../learnings/moduleresolution-split-worker-vs-dashboard|`moduleResolution` split: NodeNext in packages, Bundler in apps]] — what each workspace uses and why.
- [[../learnings/fumadocs-version-triple-2026-05|Fumadocs version triple (as of 2026-05-07)]] — supported tuple is `fumadocs-core@^16.8.8 + fumadocs-ui@^16.8.8 + fumadocs-mdx@^15.0.0`; UI 17 blocked by mdx peer.

## `#gotcha` — Things that tripped us up

- [[../learnings/claude-bare-mode-no-oauth|Claude Code `--bare` mode skips OAuth]] — use the SDK or drop `--bare`.
- [[../learnings/claude-code-cli-blocks-root|Claude Code CLI blocks `--dangerously-skip-permissions` as root]] — container must run as non-root for `permissionMode: 'bypassPermissions'`.
- [[../learnings/hermes-prompt-caching-invariants|Hermes' prompt-caching invariants]] — never alter past context mid-conversation; applies to Zeno too.
- [[../learnings/sdk-mcp-server-type-not-exported|SDK MCP server type not exported]] — in-process MCP servers need a cast at the call boundary; SDK union doesn't include them.
- [[../learnings/hot-reload-needs-getter-not-snapshot|Hot-reload needs getter, not snapshot]] — long-lived components must read mutable state via `() => T`, not a captured value.
- [[../learnings/pnpm-only-built-dependencies|pnpm `onlyBuiltDependencies` for native modules]] — non-interactive way to allow postinstall scripts; required for Docker + CI.
- [[../learnings/sqlite-current-timestamp-tiebreaker|SQLite CURRENT_TIMESTAMP tie-breaker]] — second-precision ties; use `rowid` to break them for deterministic ORDER BY.
- [[../learnings/tanstack-router-flat-file-nesting|TanStack Router flat-file naming needs `.index`]] — `foo.tsx` becomes a layout route when `foo.bar.tsx` exists.
- [[../learnings/sqlite-autoincrement-for-stable-cursors|SQLite AUTOINCREMENT for stable cursors]] — `INTEGER PRIMARY KEY` reuses rowid after DELETE; AUTOINCREMENT doesn't.
- [[../learnings/better-sqlite3-writer-contention|better-sqlite3 writer-lock contention]] — raw insert is µs; a long transaction blocks the other process.
- [[../learnings/logger-factory-dbsink-propagation|Module-level loggers skip the dbSink]] — pass the logger through constructors for events to reach the logs table.
- [[../learnings/appdeps-growth-propagates-to-tests|AppDeps growth propagates to tests]] — a new field means sweeping all api test helpers; don't miss one.
- [[../learnings/workspace-node-modules-in-docker|pnpm workspace node_modules in Docker]] — each workspace's `node_modules/` must be copied into the runtime image, not just the root.
- [[../learnings/macos-case-insensitive-git-mv|macOS case-insensitive FS needs two-step `git mv`]] — case-only renames silently no-op; rename through an intermediate name.
- [[../learnings/peer-react-in-workspace-ui-package|Peer React in workspace UI package]] — deps-level React causes two-instances hook errors; peer + dev is the fix.
- [[../learnings/slack-mrkdwn-vs-markdown|Slack mrkdwn ≠ GitHub markdown]] — Claude emits `**bold**`, Slack needs `*bold*`; convert at the channel adapter, not the prompt.
- [[../learnings/slack-file-download-html-redirect|Slack file downloads return 200 OK HTML when `files:read` scope is missing]] — never trust `response.ok` alone; validate `Content-Type` against the declared mimetype or HTML gets persisted as `image.png` and the failure surfaces three layers downstream.
- [[../learnings/slack-clipboard-paste-name-collision|Slack clipboard-paste attachments all share the name `image.png`]] — multi-paste turns collide on `writeFile(<dir>/<file.name>)`; only the last paste survives. Salt the on-disk path with `file.id`; keep the operator-visible `Attachment.name` original.
- [[../learnings/git-credential-helper-for-token-rotation|Git credential helper for token rotation]] — never embed tokens in clone URLs; use a helper that reads GH_TOKEN from env at runtime.
- [[../learnings/tailwind-merge-position-conflict|tailwind-merge silently resolves position conflicts]] — `fixed` + `relative` in the same `cn()` string: merge keeps the last one, dialog renders invisible.
- [[../learnings/css-keyframes-must-exist-for-animations|CSS animations referencing missing @keyframes fail silently]] — `animate-[name]` without a `@keyframes name` block: no error, element stays at initial state.
- [[../learnings/paper-mcp-file-identity-check|Always verify Paper's open file before consulting]] — `get_basic_info` first; if `fileName` doesn't match the project, stop. The user works in parallel on multiple Paper files.
- [[../learnings/per-frame-design-registry-failure|Per-frame Paper↔code registries don't survive restructures]] — the old `packages/ui/DESIGN.md` registry pattern; lesson informs spec 0070.
- [[../learnings/tailwind-v4-import-needs-workspace-dep|`@import "@workspace/pkg/path.css"` needs the dep declared]] — PostCSS uses Node resolution; without the workspace dep in `package.json`, the `@import` errors `ENOENT` even though the file exists.
- [[../learnings/tailwind-v4-unlayered-css-overrides-utilities|Unlayered CSS in Tailwind v4 silently beats utilities]] — base resets outside `@layer base` win over every utility; wrap them or every `font-mono` etc. is mute.
- [[../learnings/connectors-validation-findings|Connectors validation surfaced three real findings]] — what the 0036 validation pass caught (token-source enforcement, etc.); each finding feeds a follow-up spec.
- [[../learnings/tailwind4-postcss-still-needed-with-turbopack|Tailwind 4 + Fumadocs needs `postcss.config.mjs` even on Turbopack]] — without it, `@apply bg-fd-diff-remove` and friends fail; Turbopack defaults don't replace the postcss plugin.
- [[../learnings/fumadocs-css-override-needs-id-specificity|Overriding Fumadocs theme tokens needs ID-level specificity]] — `neutral.css` re-binds tokens under `.dark #nd-sidebar`; `:root, .dark` overrides lose; use the same ids and `[data-active='true']` for active states.
- [[../learnings/fumadocs-mdx-source-postinstall|`fumadocs-mdx` needs a postinstall hook to materialize `.source/`]] — required scripts: `postinstall`, `predev`, `prebuild`. Import from `.source/server`, cast to `DocsCollectionEntry`.
- [[../learnings/tanstack-router-pretypecheck-regen|Dashboard `tsr generate` not wired to typecheck]] — `route-tree.gen.ts` is gitignored and needs a Vite build before `tsc --noEmit` works; fresh worktrees fail `quality-gate` until then.
- [[../learnings/fumadocs-gettext-raw-breaks-on-workers|Fumadocs `getText('raw')` reads from disk — breaks on Cloudflare Workers]] — switch to `'processed'` + enable `postprocess.includeProcessedMarkdown` in `source.config.ts`; otherwise `/llms.mdx/<slug>` 500s in production.
- [[../learnings/turbopack-rejects-og-in-catch-all|Turbopack rejects `opengraph-image` siblings of an optional catch-all]] — `app/[[...slug]]/opengraph-image.tsx` panics on dev-server startup; lift to a sibling `app/og/route.tsx` and wire metadata via `generateMetadata`.
- [[../learnings/cli-install-verify-skips-on-multi-instance|`zeno connector install --verify` silently skips on multi-instance catalogs]] — the post-install slug-diff walks top-level items only; `connector_group` items have no `slug`, so 2nd+ install of any multi-instance catalog never runs verify. Workaround: `--no-verify` + manual `zeno connector test`.
- [[../learnings/ts6-node-imports-need-explicit-types-array|TS6 + `node:` imports need explicit `types: ["node"]` in fresh package tsconfigs]] — TS6 skips resolution of `node:fs` as "absolute URI" unless node types are explicitly registered. Logger gets away via transitive `undici-types` triple-slash; new packages need the explicit line. Spec 2026-05-20-knowledge-folder-per-profile.
- [[../learnings/tsup-yaml-noexternal-breaks-bundle|tsup's bundle of `yaml` breaks at runtime — keep it external]] — adding `yaml` to `noExternal` produces `Dynamic require of "process" is not supported` at module init. Keep yaml external and add as direct dep of the consuming app. General rule: only bundle ESM-clean packages.
- [[../learnings/node24-recursive-readdir-parentpath|Node 24 `readdirSync({ recursive, withFileTypes })` exposes `parentPath`]] — depth-agnostic walks in five lines, no manual recursion, no `globby`/`fast-glob` dep. Use the Node primitive for repo-internal walks.
- [[../learnings/gh-pr-merge-cryptic-json-error|`gh pr merge --squash --delete-branch` fails with `invalid character 'd' after object key` on gh 2.83]] — workaround: `gh api repos/.../pulls/N/merge -X PUT -f merge_method=squash` + follow-up `git push origin --delete <branch>`.
- [[../learnings/yaml-frontmatter-comment-hash-truncates|YAML frontmatter values with `#` get silently truncated as comments]] — unquoted `description: ... #N ...` parses to everything up to `#`. Always quote frontmatter scalars containing YAML control chars.
- [[../learnings/postgres-mcp-auth-fail-classifies-as-timeout|`crystaldba/postgres-mcp` auth failures surface as `timeout`, not `auth`]] — the MCP server doesn't propagate Postgres' "password authentication failed" within `DISCOVER_TIMEOUT_MS = 10s`; the classifier sees a bare timeout. Functional behavior (install fail + rollback) still correct; only the error CATEGORY differs.
- [[../learnings/regression-tests-vs-final-grep-ac|Regression-guard tests trip final `git grep` AC when they contain the forbidden literal]] — `expect(out).not.toContain('USER.md')` matches the AC's grep just like the real bug would. Use a character class `/[uU]SER\.md/` to keep the assertion meaningful without surfacing the literal in the source. Spec 2026-05-20.
- [[../learnings/bind-mount-rename-coupled-to-container-rebuild|Bind-mount file rename coupled to container rebuild]] — renaming a file the worker reads from `/app/profile/` cannot land safely before the container has the new code. Sequence: write new file → `zeno restart fn --build` → verify boot log → delete old file. Both names can coexist during the gap. Spec 2026-05-20.
- [[../learnings/tanstack-validatesearch-needs-exported-interface|TanStack `validateSearch` interface must be exported + `exactOptional` aware]] — non-exported search interface fails TS4023 in the generated route tree; under `exactOptionalPropertyTypes` an `file?: string` param must be typed `file?: string | undefined`. Both fixes required when adding deep-linked routes. Spec 2026-05-20-knowledge-browser-page.
- [[../learnings/zeno-restart-uses-canonical-repo-not-worktree|`zeno restart --build` uses canonical repo, not the worktree]] — docker rebuild reads from `zeno repo` (~`~/.zeno/zeno-agent`), not from the worktree under `.claude/worktrees/`. To E2E a worktree branch: push it, detach canonical at that commit, reinstall + rebuild CLI in canonical, then restart. Validate via `/api/health` version. Spec 2026-05-20-knowledge-browser-page.
- [[../learnings/react-markdown-data-attr-components-a-override|`react-markdown` passes `data-*` from `hProperties` into `components.a`]] — broken/styled-text variants of a custom remark plugin can switch element type by reading `data-broken` (or any flag) inside `components.a` and rendering a `<span>` instead. Keeps the plugin transformation-only and the React side presentation-only. Spec 2026-05-20-knowledge-browser-page.

## `#meta` — Workflow and process

- [[../learnings/prototype-as-pixel-spec|Treating an HTML prototype as a pixel-perfect spec]] — port CSS class-by-class, use semantic classes for complex components, verify with side-by-side screenshots.

- [[../learnings/spec-review-loop-catches-real-bugs|Spec review loop catches real design bugs]] — the `spec-document-reviewer` subagent finds what I miss; don't skip it.
- [[../learnings/subagent-driven-implementation-patterns|Subagent-driven implementation patterns]] — briefing templates, review loops, when to go inline instead.
- [[../learnings/release-policy-and-flow|Release policy: CalVer + pre-release flag + trunk-based + workflow_dispatch]] — anchored decisions: no SemVer, no release branches, no `CHANGELOG.md`, no CI on the release workflow.
