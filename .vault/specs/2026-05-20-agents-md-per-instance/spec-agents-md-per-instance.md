---
status: shipped
feature: agents-md-per-instance
created: 2026-05-20
shipped: 2026-05-20
---
# AGENTS.md Per-Instance Operating Manual — Spec

**Status:** Shipped (PR [#88](https://github.com/ribeirogab/zeno-agent/pull/88), release [v2026.5.20-1](https://github.com/ribeirogab/zeno-agent/releases/tag/v2026.5.20-1))
**Scope:** Replace per-profile `USER.md` (single-owner framing) with `AGENTS.md` (multi-audience operating manual loaded deterministically into the cached system prompt). `SOUL.md` (shared baseline identity) stays unchanged. Tracks GitHub issue [#86](https://github.com/ribeirogab/zeno-agent/issues/86).

## Context

Each Zeno profile today carries a `USER.md` file framed as "the owner is described in ...". The worker injects its content into the system prompt under a `# About the user` heading. This was a fit when Zeno was strictly a single-user assistant.

In practice, a single instance routinely serves **multiple humans on the same channel** (e.g., a Slack workspace where director, sales, marketing, operations, and developers all talk to the same Zeno). The "the user" framing in the system prompt actively misleads the agent — there is no single user; there is one **operator** (the OAuth-token owner) and **N audiences** (the people on the channel).

A second, sharper problem surfaced during the [[../../profiles/fn/skills/fn-conduct/SKILL]] rollout: deterministic operating rules ("before any Slack reply, invoke `fn-conduct`") need to be in the cached system prompt every turn, not behind a probabilistic SDK skill auto-trigger. The Claude Agent SDK announces skills as `<name>: <description>` lines in the preset prompt and lets the model decide whether to load the body — and the model can decide wrong. The result is visible regressions where the wrong tier of language reaches the wrong audience (e.g., a non-developer receiving repo names, file paths, and function names in a reply).

The existing `buildSystemPrompt(soul, user)` mechanism is the natural fix: it already injects file content into the cached system prompt every turn. Reframing the per-profile file from "user bio" to "operating manual" (rules, skill summary, channel conventions, language defaults) preserves the mechanism and removes the misleading framing.

Adjacent fact for the design: SOUL.md still carries critical baseline identity (mission, connector model, skills mechanics, anti-double-post rule, safety rules). It is shared across all profiles and is NOT touched by this change.

Related learnings:

- [[../../learnings/claude-sdk-settings-sources-skills|Claude Agent SDK does NOT auto-discover skills]] — SDK skill auto-load is via `settingSources`, but skill-body activation is still probabilistic.
- [[../2026-04-21-agent-profile-split/spec-agent-profile-split|Spec 0021 — Agent / Profile Split]] — established the current `agent/` (shared) vs `profile/` (per-instance) layout. This spec changes what lives inside `profile/` (USER.md → AGENTS.md), not the split itself.

## Problem Statement

`USER.md` causes three concrete problems that this spec fixes together:

1. **Misleading framing.** A Zeno instance has no single user; the system prompt's `# About the user` heading produces replies addressed to "you" when the audience is a different person each turn.
2. **No deterministic surface for per-instance operating rules.** Rules that must apply every turn (vocabulary policy, mandatory skill consultation, language defaults) are pushed into skills, which the SDK auto-loads probabilistically. The model occasionally skips a skill body and produces a regression that violates the documented policy.
3. **Conceptual mismatch with reality.** A Zeno instance has **one operator** (OAuth-token owner) and **N audiences** (people on the channel). The single-user framing leaks into the codebase (`USER.md`, `parse-user-md.ts`, `use-user-md.ts`, `UserMdEditor`, dashboard label "User profile") and bleeds into model behavior.

## Non-Goals

- **No backward compatibility for `USER.md`.** Clean break. Worker only reads `AGENTS.md`. No fallback path, no deprecation warning, no migration script. The only existing real profile (the maintainer's `fn` profile) is migrated manually inside this PR.
- **No CLAUDE.md symlink, no SDK auto-load of CLAUDE.md.** `settingSources` keeps `['user']` (skills only). `CLAUDE.md` is not produced, not symlinked, not loaded. Rationale: `buildSystemPrompt` already injects `AGENTS.md` content deterministically; a symlink would be cross-platform friction with zero runtime benefit.
- **No multi-tenant authorization, no per-audience credential scoping.** The "operator vs audience" reframing is conceptual only — there is still one OAuth token and one set of MCP credentials per instance. Per-audience policy is a skill's job (e.g., `fn-conduct`), not the worker's.
- **No settings-UI rewrite.** The dashboard editor that today edits `USER.md` switches to editing `AGENTS.md` with the same UI shape (textarea, save button). Only the file path, component name, hook name, route, and label change. No new fields, no schema validation, no preview pane.
- **No template placeholders.** The default `AGENTS.md` template is static: no `<your-name>`, no `<auto-detected-tz>`. The operator writes their own content.
- **No edits to shipped specs in `.vault/specs/`.** Shipped specs are immutable per project convention. References in old specs to `USER.md` remain as historical record. The constitution is the only `.vault/` file edited (it is canonical, not historical).
- **No bundled FN-specific content in the default template or in `SOUL.md` or in the constitution.** The FN profile's `AGENTS.md` is rewritten with FN-specific rules, but those rules live ONLY in `~/.zeno/profiles/fn/AGENTS.md` (off-repo). The default template stays generic.

## Constraints

- **Worker runtime is Docker-only.** Files are read from `/app/profile/AGENTS.md` (read-only bind mount of `~/.zeno/profiles/<profile>/`).
- **Quality-gate must pass green.** Every change keeps `pnpm run quality-gate` green at commit time. No partial states.
- **No skips of pre-commit hooks.** Hooks are not bypassed (per global rule and constitution).
- **No real identifiers in committed content.** The default template, all docs, all repo-root files, the agent identity, and the constitution stay sanitized per [[../../rules/sanitization|.vault/rules/sanitization]]. Real channel IDs (`C0…`) and real personal names are only acceptable in the maintainer's off-repo profile (`~/.zeno/profiles/fn/AGENTS.md`).
- **Constitution edits are surgical.** The four lines that reference `USER.md` are updated and the "Zeno is single-user" framing is dropped in favor of "single-operator, multi-audience-capable". No other constitutional surface is touched in this spec.
- **No leaking FN profile content into the default template or constitution.** The default template is a generic, empty skeleton with HTML comments illustrating the section purposes. FN-specific rules (fn-conduct mandatory, language pt-BR, etc.) appear ONLY in the FN profile file, not anywhere in the repo.
- **Prompt-cache invariant.** The combined system prompt (SOUL + AGENTS) must remain stable across turns to keep the Anthropic prompt-cache warm; per-turn user-specific context already goes in the `[slack_context]` block on the user message side, not the system prompt.

## User Stories / Scenarios

1. **Operator creates a new profile.** Operator runs `zeno profile create alpha`. The CLI scaffolds `~/.zeno/profiles/alpha/AGENTS.md` from the static template (empty skeleton with section headings and inline comment hints). Operator opens the file, fills in operating rules, skills to invoke, channel conventions, and language defaults. Operator runs `zeno start alpha`. The worker boots and logs `agents_md_loaded`. The system prompt now contains SOUL + the operator's manual.
2. **Operator edits AGENTS.md while a profile is running.** Operator opens `~/.zeno/profiles/alpha/AGENTS.md` and adds a new operating rule. The profile watcher detects the change (same hot-reload path that watched `USER.md` today). The next turn's system prompt includes the new rule. Cache invalidates and re-warms.
3. **Audience-tier reply scenario (the regression this spec prevents).** A non-developer sends a Slack message to the FN instance. The worker boots with SOUL + FN AGENTS.md in the system prompt. The FN AGENTS.md operating rule "Toda mensagem no Slack: invocar `fn-conduct` ANTES de compor a reply" is in the cache every turn. The model invokes `fn-conduct` deterministically (not via probabilistic skill auto-trigger). The reply respects the policy (no repo names, no file paths, no function names).
4. **Maintainer migrates the FN profile.** As part of this PR, the maintainer runs `mv ~/.zeno/profiles/fn/USER.md ~/.zeno/profiles/fn/AGENTS.md` and overwrites the content with the FN-specific operating manual draft (drafted by the agent, reviewed by the maintainer in the PR). After `zeno restart fn`, the worker logs `agents_md_loaded`, not `user_md_loaded`.
5. **Dashboard editor.** Operator opens the profile dashboard, clicks "Operating manual" (formerly "User profile") in the sidebar, edits the AGENTS.md content in the textarea, clicks save. The API writes to `~/.zeno/profiles/<profile>/AGENTS.md`. The watcher reloads. Same flow as USER.md today; only labels and paths change.

## Acceptance Criteria

Worker / Runtime:

- [ ] `apps/worker/src/agent/system-prompt.ts` exports `buildSystemPrompt(soulMdContent, agentsMdContent)` whose return value matches `${soul}\n\n${agents}` with NO `# About the user` heading and NO `NO_USER_NOTE` fallback string.
- [ ] On worker boot with `/app/profile/AGENTS.md` present and non-empty, structured logs contain an event `agents_md_loaded` with a `bytes` field.
- [ ] On worker boot with `/app/profile/AGENTS.md` absent or empty, structured logs contain a warn-level event `agents_md_missing` and the worker still boots.
- [ ] No log event named `user_md_loaded` or `user_md_missing` is emitted by the worker after the change (verified by `grep -r 'user_md_' apps/worker/src/` returning empty).
- [ ] `apps/worker/src/profile/watcher.ts` watches `AGENTS.md` (not `USER.md`); editing `AGENTS.md` in a running profile triggers the same hot-reload path that USER.md edits triggered before.

CLI:

- [ ] `zeno profile create test-agents-md` creates `~/.zeno/profiles/test-agents-md/AGENTS.md` whose content equals `templates/profile/AGENTS.md` verbatim (no placeholder substitution).
- [ ] `zeno profile create test-agents-md` does NOT create `~/.zeno/profiles/test-agents-md/USER.md`.
- [ ] `zeno profile show test-agents-md` displays a row for `AGENTS.md` (not `USER.md`) under the profile-files listing.
- [ ] `zeno profile create --help` text mentions `AGENTS.md` (not `USER.md`) wherever the file is referenced.

API:

- [ ] `apps/api/src/routes/settings.ts` `TRACKED_FILES` constant equals `['SOUL.md', 'AGENTS.md', 'crons.yaml']` (exact tuple, order preserved).
- [ ] `apps/api/src/routes/settings.ts` `WRITABLE_FILES` set equals `new Set(['AGENTS.md'])`; PUT to `USER.md` returns 403.
- [ ] `apps/api/src/lib/parse-user-md.ts` is deleted; `apps/api/src/lib/parse-agents-md.ts` exists; all imports updated; tests pass.
- [ ] GET `/api/settings/profile-files/AGENTS.md` returns the file content with `200`; PUT `/api/settings/profile-files/AGENTS.md` with a JSON body `{ "content": "..." }` writes the file and returns `200`. GET/PUT for `/api/settings/profile-files/USER.md` both return `403` (file not in `WRITABLE_FILES`).

Dashboard:

- [ ] `apps/dashboard/src/components/settings/user-md-editor.tsx` is deleted; `agents-md-editor.tsx` exists with component name `AgentsMdEditor`.
- [ ] `apps/dashboard/src/lib/use-user-md.ts` is deleted; `use-agents-md.ts` exists with hook name `useAgentsMd`.
- [ ] Sidebar label and route reference "operating manual" / "AGENTS.md" (exact copy decided at implementation time); no "User profile" / "USER.md" label survives.
- [ ] Dashboard unit tests for sidebar and settings page assert the new labels and routes.

Templates:

- [ ] `templates/profile/USER.md` is deleted from the repo.
- [ ] `templates/profile/AGENTS.md` exists, contains only generic content (no FN-specific rules, no real identifiers, no placeholders to substitute).
- [ ] `templates/profile/README.md` references `AGENTS.md` instead of `USER.md`.

Public docs / marketing:

- [ ] `apps/docs/content/docs/{cli,profile,profiles}.mdx` reference `AGENTS.md` instead of `USER.md`.
- [ ] `apps/docs/src/generated/cli-flags/profile-create.mdx` is regenerated after the CLI flag-description change.
- [ ] `apps/web/src/sections/how-it-works-section.tsx` landing copy references `AGENTS.md` (or the file reference is removed) — no surviving `USER.md` mention in customer-facing copy.

Repo + agent identity + constitution:

- [ ] Repo root `AGENTS.md` line 3 reads `~/.zeno/profiles/<profile>/AGENTS.md` (not `USER.md`). The `CLAUDE.md` symlink at repo root continues to resolve to this file (already a symlink today).
- [ ] `agent/SOUL.md` substitutes the line "If `USER.md` specifies a preferred language" with "If `AGENTS.md` specifies a preferred language". No other SOUL.md content changes.
- [ ] `.vault/constitution.md` updates four references to `USER.md` to `AGENTS.md` (lines 13, 28, 47, 88 in the current file). The "Zeno is single-user" wording in line 28 is replaced with wording that admits multi-audience use under a single operator. Line 48's "Migration to API key (or enterprise auth) is reserved for the day Zeno serves multiple people" is reworded to "Migration to API key (or enterprise auth) is reserved for the day Zeno serves multiple billed operators" (or equivalent wording that distinguishes audiences from billed operators) so the reframe in line 28 does not contradict the OAuth/API-key principle. No other constitution content changes. No FN-specific content is added.

Migration (FN profile, manual inside the PR):

- [ ] `~/.zeno/profiles/fn/USER.md` no longer exists.
- [ ] `~/.zeno/profiles/fn/AGENTS.md` exists and contains the FN-specific operating manual drafted in this spec (operator confirmed wording during PR review).

End-to-end (reviewer-verifiable):

- [ ] `git grep -E 'USER\.md|user-md|use-user-md|UserMd|parse-user-md|user_md_' apps/ packages/ templates/ agent/ AGENTS.md CLAUDE.md` (case-sensitive) returns no results.
- [ ] `pnpm run quality-gate` is green at HEAD of the feature branch.

## Manual verification (operator-only, post-merge)

These checks require access to the operator's local Docker environment and Slack workspace. They are run by the operator after the PR merges and are NOT a gate on PR sign-off (they cannot be verified by a non-operator reviewer in under a minute):

- After `zeno restart fn`, the worker log contains `agents_md_loaded` for the FN profile.
- A smoke test (a non-developer audience sends a Slack message about an existing technical surface to the FN instance) produces a reply that does NOT contain repo names, file paths, function names, or constant names. This is the regression the spec prevents; if it reappears, file a follow-up issue.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Rename misses a string reference that TypeScript cannot detect (e.g., a literal `'USER.md'` inside a string or comment), leaving the worker reading a non-existent file. | The end-to-end acceptance criterion runs `git grep -E 'USER\.md|user-md|use-user-md|UserMd|parse-user-md|user_md_' apps/ packages/ templates/ agent/ AGENTS.md CLAUDE.md` and requires empty output before merge. |
| Hot-reload watcher keeps watching the old `USER.md` path after profile-dir was renamed mid-run, missing edits to `AGENTS.md`. | Restart container after rename (`zeno stop fn && zeno start fn`); watcher tests assert the new path. |
| Dashboard caches the old hook/component reference after deploy, breaking the settings page. | Smoke-test the settings page in the dev preview after the change; the dashboard is a fresh build per release. |
| Constitution edit reframes "single-user" in a way that contradicts implementation reality (still one OAuth token). | Constitution wording explicitly says "single-operator, multi-audience-capable" — the OAuth and token model are unchanged. The reframe is conceptual only. |
| FN AGENTS.md ships with real Slack channel IDs visible to anyone with access to the maintainer's machine. | FN profile dir is off-repo and gitignored. Real IDs are scoped to the operator's local filesystem; they do not enter the repo. Default template stays generic. |
| SDK preset auto-load behavior changes silently in a future SDK version, invalidating the `settingSources: ['user']` invariant the spec depends on. | Lock SDK version in `package.json`. Add a post-ship learning capturing the invariant. Spec [[../2026-04-30-soul-skills-realign/spec-soul-skills-realign|0060]] already documents the related preset-shape invariant. |
| Operator-edited `AGENTS.md` accidentally embeds `<your-name>`-style placeholders that the template no longer substitutes, producing a literal `<your-name>` in the system prompt. | Template ships with no `<...>` placeholders. Inline HTML comments illustrate the section purpose and are explicitly marked "remove before going live". Acceptance criterion: template content has no `<...>` placeholder tokens. |

## Open Questions

None. All scope decisions are locked in this spec.
