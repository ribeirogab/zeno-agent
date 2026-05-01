---
status: draft
feature: skills-and-capability-defaults
created: 2026-04-28
shipped: null
---
# Skills and Capability Defaults — Spec

**Status:** Draft
**Scope:** Make Zeno usable out-of-the-box: default skills shipped with the binary (immutable), profile-seeded skills, default-on dev capabilities, Playwright in the catalog, plus a critical bug fix in skill detail navigation.

## Context

Spec 0052 shipped skills as a DB-managed concept: operator uploads `SKILL.md` via dashboard → row in `skills` table → worker materializes to `~/.claude/skills/<name>/SKILL.md` → SDK auto-discovers based on description match. After live verification two gaps surfaced:

1. **Zeno is mute by default.** A fresh install has zero skills and all non-MCP capabilities (`Bash`, `Edit`, `Write`, etc.) disabled. The operator can't ask Zeno to clone a repo or review a PR until they manually upload skills + flip toggles in `/settings`. The connector-only safe default from spec 0052 over-corrected.
2. **There's no path to ship skills with Zeno.** A maintainer can't bake `zeno-development` into the agent's image and have every install benefit from it. Same problem for profile-specific skills (e.g. `fn-code-review`) — they only exist as DB rows on the operator's machine, no provenance, no upgrade path.

Plus one bug noticed in QA: clicking a skill row on `/skills` updates the URL to `/skills/:id` but does not render the detail screen. Stays on the listing.

The PR-review-via-Slack flow that existed pre-spec-0050 (the operator pastes 3 PR URLs in a channel, @-mentions Zeno, gets a consolidated review reply in thread) never got formal documentation in the connectors-only thesis. This spec uses it as the E2E validation scenario for the new skill defaults.

## Problem Statement

Zeno needs three things to be useful out-of-the-box on a fresh install:

1. **Skill provenance and upgrade path.** Skills shipped with Zeno (`zeno_default`) must update when the operator pulls a new release. Skills shipped with a profile (`profile`) must seed on first boot but stay editable. Skills uploaded via dashboard (`dashboard`) are unchanged from spec 0052.
2. **Capabilities Zeno needs to do its job, on by default.** The capabilities required by `zeno-development` (`Bash`, `Read`, `Edit`, `Write`, `Glob`, `Grep`) and `ToolSearch` (already on per migration 12) ship enabled. The sensitive/situational ones (`Task`, `WebFetch`, `WebSearch`) stay off, opt-in via `/settings`.
3. **Playwright as a real catalog connector.** Today only DB-registered custom connectors get gated; the built-in `playwright` from `agent/mcp.json` rides the `builtin_mcp_allow` slot, so its tools can't be linked to skills nor toggled. Promote it to a catalog entry with a permission model.

Plus the QA bug:

4. **Skill detail route renders nothing.** Either the route-tree didn't pick up `skills.$id.tsx` or the component throws silently.

## Non-Goals

- Not redesigning the skill-installation flow itself (spec 0052's CRUD endpoints stay).
- Not introducing a "fork a default skill" UI affordance — operator can manually copy a `zeno_default` `SKILL.md` to their profile and rename (drop the `zeno-` prefix). Documented but not automated.
- Not introducing an "always-loaded skill" concept — auto-discovery via description match continues to be the single trigger mechanism.
- Not changing the connector-permission gate's decision tree from spec 0052.
- Not modifying the Slack listener — PR-review trigger relies entirely on skill description matching the user's intent.
- Not adding a `mcp__zeno__set_final_reaction` or similar tool (acknowledged rough edge from spec 0028, out of scope here).
- Not multi-user isolation — single-operator scope per constitution.

## Constraints

- **Skills as files OR as DB rows, never both.** The seed mechanism populates the DB at boot; after that the materializer (already shipped) writes the DB to `~/.claude/skills/<name>/SKILL.md`. The `agent/skills/` and `profiles/<name>/skills/` trees are SOURCE OF SEED, not parallel deployment paths.
- **Default capabilities must be safer than blanket-on.** Even though `Bash` ships enabled, the connector-permission gate still consults `agent_capabilities.enabled` per call. Operator can disable Bash in `/settings` and it takes effect immediately (already verified live in spec 0052 testing).
- **Migration 12 already applied in production fn profile.** Cannot modify it. New behavior goes in migration 13+.
- **`source` column has to be addable to existing `skills` table without losing data.** Default for existing rows: `'dashboard'`.
- **Stay stacked on `feat/skills`.** PR base is `feat/skills`, not `main`. Merge order: PR #14 first, then this PR.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Skill source enum | `zeno_default \| profile \| dashboard` | Three distinct ownership models — Zeno binary, profile, operator dashboard. |
| Default skill prefix | `zeno-*` enforced by convention; not by DB CHECK constraint | Naming convention reads cleanly; uniqueness constraint on `skills.name` already prevents collision; CHECK would be over-engineered. |
| Default skill mutability | API rejects PATCH/DELETE when `source='zeno_default'` (HTTP 403, error code `zeno_default_immutable`) | File is canonical. Forking = manual copy to profile. |
| Profile skill mutability | Editable via dashboard after seed (PATCH/DELETE allowed) | INSERT OR IGNORE makes file the seed; DB authoritative after first boot. |
| `zeno_default` seed semantics | UPSERT every boot (`INSERT ... ON CONFLICT(name) DO UPDATE SET description, body, source, updated_at`) | File is canonical; pulling new Zeno release updates the skill. |
| `profile` seed semantics | INSERT OR IGNORE | Seed once; let operator edit via dashboard without surprise overwrites on next boot. |
| Orphan cleanup | At boot, after seed: `DELETE FROM skills WHERE source='zeno_default' AND name NOT IN (<files in agent/skills/>)`. **Profile orphans NOT deleted** | Default skills are tracked by the binary; profile skills may have been customized. |
| Capability defaults (migration 13) | `Bash`, `Read`, `Edit`, `Write`, `Glob`, `Grep` flipped to `enabled=1`. `Task`, `WebFetch`, `WebSearch` stay `0`. `ToolSearch` already 1 from migration 12. | Aligns with the `zeno-development` workflow; sensitive tools stay opt-in. |
| Playwright in catalog | New entry in `agent/connectors-catalog.json`, slug `playwright`, source `catalog`, transport `stdio`, command `npx -y @playwright/mcp@latest`, default tool surface = the standard `@playwright/mcp` tools (categorized by category) | Promotes from `builtin_mcp_allow` slot to first-class connector with permission model. |
| Chrome in Docker | `RUN npx -y playwright install chrome` in `infra/Dockerfile` (runtime stage) | Avoids "Chrome not installed" at first use; baked once per image. |
| PR review trigger | Description-only auto-discovery — `fn-code-review` skill description mentions PR URL + @-mention pattern; SDK matches user intent | Zero changes to Slack listener; ports cleanly to other channels. |
| Bug fix scope | Investigate `route-tree.gen.ts` regeneration AND component runtime failure on `/skills/:id` | One of those two is the cause; cheap to verify both. |

## User Stories / Scenarios

### S1 — Fresh install of Zeno (no profile customization)

1. Operator clones the repo, fills `profiles/default/.env`, runs `pnpm run docker:up`.
2. Worker boots → migrations run → boot seeder reads `agent/skills/` → seeds `zeno-development` (and any other `zeno_default` skill in the binary).
3. Materializer writes `~/.claude/skills/zeno-development/SKILL.md`.
4. Operator opens dashboard → `/skills` shows `zeno-development` with `default · zeno` badge, no edit/delete buttons.
5. Operator opens `/settings` → 6 dev capabilities already enabled (Bash, Read, Edit, Write, Glob, Grep), `ToolSearch` enabled, 3 sensitive ones (Task/WebFetch/WebSearch) disabled.
6. Operator DMs Zeno on Slack: "clone https://github.com/me/repo and add a README" — agent uses `Bash`/`Edit`/`Write` (allowed) + auto-discovers `zeno-development` (description match) and follows the workflow.

### S2 — Profile customization (fn profile with fn-code-review)

1. Operator pulls the `feat/skills-defaults-and-prreview` branch, switches to `PROFILE=fn`.
2. Worker boots → boot seeder reads `agent/skills/` (zeno-development) AND `profiles/fn/skills/` (fn-code-review) → seeds both.
3. Operator opens `/skills` → sees `zeno-development` (`default · zeno`, locked) AND `fn-code-review` (`profile · fn`, editable).
4. Operator edits `fn-code-review` body via dashboard → DB updated → materializer writes new content to `~/.claude/skills/fn-code-review/SKILL.md` → next agent query uses updated body.
5. Worker reboot → INSERT OR IGNORE — operator's edit is preserved.

### S3 — Zeno upgrade with new default skill

1. Maintainer adds `agent/skills/zeno-cron/SKILL.md` to the next release.
2. Operator pulls + redeploys.
3. Worker boots → seeder UPSERTs `zeno_default` skills → new `zeno-cron` row appears in DB.
4. Materializer writes the new file to `~/.claude/skills/zeno-cron/`.
5. SDK auto-discovers `zeno-cron` on next query.

### S4 — Default skill removed by maintainer

1. Maintainer removes `agent/skills/zeno-old-skill/` from the repo.
2. Operator redeploys.
3. Worker boots → seeder UPSERTs surviving defaults → orphan-cleanup pass deletes any `source='zeno_default'` row whose name is no longer in the file tree.
4. Materializer reconciles FS — `~/.claude/skills/zeno-old-skill/` removed.

### S5 — PR review via Slack (E2E validation)

1. Operator posts in `#pr-reviews`: 3 PR URLs + @-mention zeno-agent.
2. Slack listener (already existing, no changes) gets `app_mention` event → builds `userMessage` with full text → invokes the agent.
3. Agent's SDK scans `~/.claude/skills/`, matches the `fn-code-review` description against intent, loads the skill body into context.
4. Skill body (in EN; review/Slack output in PT-BR per skill content) instructs: "for each PR URL, use `mcp__github-app-*` tools (`view`, `diff`, `comments`); apply FN review criteria; submit via `gh pr review`; reply in thread with one line `<@user> <outcome> <review-url>`."
5. Agent runs the workflow for all 3 PRs (parallel or sequential) and posts a single consolidated thread reply such as "@ribeiro 3 aprovados ✅ — pr1 · pr2 · pr3".

### S6 — Capability lockdown by operator

1. Operator is security-conscious, goes to `/settings` → disables `Bash`.
2. Next agent query that attempts `Bash` → gate denies → agent informs "Bash capability is required for this".

### S7 — Playwright tool from catalog

1. Operator goes to `/connectors/catalog` → installs Playwright.
2. Connector appears in `/connectors` with tools `browser_navigate`, `browser_snapshot`, etc., all `permission='ask'` by default (catalog convention).
3. Operator marks `browser_navigate` as `always_allow`.
4. Agent attempts `mcp__playwright__browser_navigate('https://x.com')` → gate allows → tool executes (Chrome already installed in the image).

### S8 — Bug fix verification

1. Operator clicks a skill row on the `/skills` listing.
2. URL updates to `/skills/:id` AND the screen content switches to the skill's detail view.

## Success Criteria

- [ ] **Migration 13** flips `Bash/Read/Edit/Write/Glob/Grep` to `enabled=1`. Idempotent. Tests assert the new seed state.
- [ ] **Migration 14** adds column `source TEXT NOT NULL DEFAULT 'dashboard' CHECK (source IN ('zeno_default','profile','dashboard'))` on `skills`. Backfill: existing rows keep `'dashboard'`.
- [ ] **Boot seeder** runs once before the materializer; reads `agent/skills/` (UPSERT + orphan cleanup) and `profiles/<active-profile>/skills/` (INSERT OR IGNORE); emits structured log `skills_seeded {zenoDefault: N, profile: M, orphansRemoved: K}`.
- [ ] **API** rejects PATCH/DELETE on skills with `source='zeno_default'` returning HTTP 403 + `error: "zeno_default_immutable"`. Tests cover both verbs.
- [ ] **API response shape** — `GET /api/skills` (list) and `GET /api/skills/:id` (detail) include `source: 'zeno_default' | 'profile' | 'dashboard'`. The `Skill` type in `@zeno/storage` gains the field. Dashboard hooks are typed to match.
- [ ] **Orphan cleanup audit log** — boot seeder emits `skills_orphan_cleanup_complete {removed: [<names>], cascadeAffected: <count>}` when it deletes `zeno_default` rows whose file disappeared. Verifiable in seeder test.
- [ ] **Dashboard** shows a badge `default · zeno` (lock icon, no edit/delete buttons) or `profile · <name>` in both the list and detail; `dashboard`-source skills show no badge.
- [ ] **`agent/skills/zeno-development/SKILL.md`** committed, based on `tmp/profile-fn-backup-2026-04-27/skills/dev-workflow/SKILL.md` adapted for the Zeno context (no FN-specific references).
- [ ] **`profiles/fn/skills/fn-code-review/SKILL.md`** committed, based on `tmp/profile-fn-backup-2026-04-27/skills/code-review/SKILL.md`.
- [ ] **Playwright** entry in `agent/connectors-catalog.json` with the full tool surface.
- [ ] **Dockerfile** installs Chrome via `npx -y playwright install chrome` in the runtime stage.
- [ ] **Skill detail navigation bug** fixed — clicking a row in `/skills` renders the detail screen.
- [ ] **Quality gate** passes 30/30 (no regression in existing tests; new tests cover migrations 13/14, boot seeder, API immutable lock, badge UI).
- [ ] **Docker boot** is clean: log shows `skills_seeded`, `agent_capabilities_loaded enabled=[Bash,Edit,Glob,Grep,Read,ToolSearch,Write]`, materializer runs, SDK auto-discovery sees `zeno-development` + (when running with `PROFILE=fn`) `fn-code-review`.
- [ ] **E2E via Slack — 10+ runs** against `AcmeBooks/ecommerce-frontend`:
  - PRs opened as **draft** with `[zeno-test]` prefix in the title.
  - Mix of explicit ("use fn-code-review") vs implicit (no skill mention).
  - Scenarios: clean/approve, broken/reject, nitpicks, suggestions, UI without screenshot, unnecessary dep, missing tests for a new feature, multi-feature PR, convention violation (Biome), bad commit message, PR with no description.
  - Clean PRs generated by Zeno itself via `zeno-development`; broken PRs hand-crafted with the targeted defect.
  - Cleanup: close PR + delete branch after each test.
  - Result: table 10+×N in `tmp/spec-0053-test-results.md` + summary in Slack.
- [ ] **Final 3-round review** with zero findings.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Boot seeder runs BEFORE the materializer but the DB still holds rows from the previous materialization — transient inconsistency possible | Seeder + materializer wrapped in a single `bootSkillsReconcile()` called once before the agent/watcher start. Logs show the order. |
| `source` column added via ALTER TABLE on a DB that already has rows — silent backfill to `'dashboard'` may mask future bugs | Explicit migration: `UPDATE skills SET source='dashboard' WHERE source IS NULL` before the CHECK constraint; test asserts the initial value. |
| API rejects PATCH/DELETE on `zeno_default` but the dashboard still renders the buttons → operator clicks → confusing 403 | UI hides the buttons when `source==='zeno_default'`; renders a "managed by Zeno" badge in their place. |
| Dev capabilities default-on weakens the "connector-only safe default" thesis from spec 0052 | Document the trade-off explicitly: Zeno ships with a built-in dev workflow, so the capabilities that workflow needs are on. Operator can lock down via `/settings`. |
| Chrome install in the Dockerfile grows the image by ~300MB | Acceptable (one-time cost). If it becomes a problem a future spec can move it to lazy install on first use. |
| `zeno-development` description does not match user intent expressed in PT-BR (the skill content is in EN) | Description tuned manually AND verified in E2E (mix of explicit/implicit triggers); iterate until auto-discovery is reliable. |
| Slack listener already accepts @-mentions OK, but thread context (parent message) may not always include PR URLs | E2E tests both single-shot messages and threaded ones; tune the skill description to cover both. |
| Migration 13 flips pre-existing rows that the operator may have disabled on purpose (downgrade scenario) | Rare in production (single fn profile, new install); accept and document. Operator re-disables via `/settings`. |
| Skill `fn-code-review` needs org-specific GitHub App tokens (`ACME_GH_TOKEN`, `QS_GH_TOKEN`, etc.) — these only exist when the corresponding github-app connector is installed | Skill body checks available tokens at execution time; if missing, instructs the operator to install the github-app connector first. |
| Orphan cleanup may delete `connector_skills` rows via FK CASCADE — user loses manual links | Accept (the link was to a skill that no longer exists). Log the deleted names for audit. |
| Detail-nav bug fix may turn out to be a missing `route-tree.gen.ts` (gitignored) | Investigate first; if gitignored, commit it. If a runtime error, fix the component. |

## Open Questions

None. The owner closed every question via conversation + two parallel subagents that converged on Option C for seed semantics. Edge cases are captured in the Decisions and Risks tables.

## Out-of-scope follow-ups (for future specs)

- DB-level CHECK constraint on `skills.name` to enforce kebab-case + the `zeno-` prefix only when `source='zeno_default'` (defense-in-depth against direct DB inserts).
- "Fork default skill" UI affordance (clicking a zeno-default skill → "Fork to profile" creates an editable copy).
- Newline escaping for `description` on FS write (defensive against YAML injection).
- `mcp__zeno__set_final_reaction` SDK tool so the Slack reaction varies by review outcome (spec 0028 mentioned).
- Always-loaded skills (a skill that appears every turn, bypassing auto-discovery).
