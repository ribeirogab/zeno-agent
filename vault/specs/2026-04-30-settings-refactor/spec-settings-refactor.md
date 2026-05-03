---
status: shipped
feature: settings-refactor
created: 2026-04-30
shipped: 2026-05-03
---
# Spec 0067 — Settings refactor (tabs + USER.md inline editor + remove Restart)

**Status:** Shipped (2026-05-03, PR #30)
**Scope:** Restructure `/settings` from a single long vertical scroll into four horizontal tabs (`profile` default, `capabilities`, `backend`, `about`); make `USER.md` inline-editable from the `profile` tab (textarea + Cmd+S + unsaved-changes guard + last-modified timestamp); remove the `Restart Worker` button + its modal entirely; remove the `mcp.json` row from `profileFiles` (post-spec-0032 it's a DB-managed lie); document the `docker compose restart` escape hatch in `about`.

## Context

Today's `/settings` (`apps/dashboard/src/routes/_authed/settings.tsx`) is a single-page vertical scroll with four sections stacked: agent capabilities, backend, profile files, about. The page header carries a `Restart Worker` button that opens a confirmation modal (`apps/dashboard/src/components/modals/restart-worker-modal.tsx`). The `profileFiles` section lists USER.md, SOUL.md, mcp.json, crons.yaml as read-only rows annotated `bind-mounted · edits apply on next agent turn`.

Three things are wrong with this:

1. **The page conflates four very different concerns** — sensitive toggles (capabilities), runtime telemetry (backend), file-edit affordances (profile files), and informational chrome (about). Stacking them vertically gives equal visual weight to all and forces the operator to scroll past unrelated content to find what they came for.

2. **USER.md is bind-mounted but locked.** The operator's most-frequently-edited profile file is a textbox away from being editable directly in the dashboard, but instead requires opening a host-FS editor or `docker exec` shell. The profile watcher (`apps/worker/src/profile/watcher.ts`) already handles hot-reload — the missing piece is just write-back.

3. **`Restart Worker` is dead code with a footgun.** Profile watcher hot-reloads `profile/` changes; DB-managed connectors (post spec 0032) don't need a worker restart; the in-flight Slack thread + cron run rollovers are all designed for live config changes. The button's only legitimate use is "the SDK got into a retry loop" — which is rare, opaque, and better solved by `docker compose restart` from the terminal where the operator can see what's failing. Surfacing it as a header button invites cargo-cult clicks.

Plus, `mcp.json` is in `profileFiles` for legacy reasons. Spec 0032 made connectors DB-managed; `profile/mcp.json` is no longer the source-of-truth in any non-trivial workflow. Showing it as an editable file is a teaching lie.

This spec promotes raw-list items 5a/5b/5c from `context/backlog.md` into a coherent M-sized PR.

## Problem Statement

A new operator opens `/settings` for the first time. They see:
- A toggle grid for capabilities they don't yet understand.
- A read-only backend card.
- A list of "profile files" they can't edit (one of which is misleading post-0032).
- An "about" footer.
- A red `Restart Worker` button calling for attention from the header.

They want to set their name in `USER.md`. The dashboard tells them to do it via the host filesystem. They want to flip a capability — they have to scroll past the read-only backend card. They notice the `Restart` button and click it because it looks important — `claude-code` reboots, in-flight Slack thread gets a 3-second pause, agent core reboots. They learn the wrong lesson ("when in doubt, restart"). The `mcp.json` row teaches them that file matters when it doesn't.

The settings page should be a place where the right thing is easy and the wrong thing is impossible.

## Non-Goals

- **Out of scope: editing SOUL.md or crons.yaml from the dashboard.** SOUL.md is committed identity — version-controlled, repo-bound. crons.yaml is legacy static-cron config; the right way to manage crons is `/crons`. Counterpoint subagent 0067-B argued "either all editable or none" — owner-call: USER.md is the only one that legitimately changes via this UI. Captured as Open Questions for follow-ups.
- **Out of scope: creating a `FileEditor` component generic enough to handle YAML/JSON/Markdown with per-file validators.** Subagent 0067-B suggested it; rejected for now (YAGNI). USER.md gets a plain textarea; if a second file later wants editing, refactor at that point.
- **Out of scope: a markdown preview for USER.md.** USER.md is short and structural; preview adds noise to a 60-second edit task.
- **Out of scope: file-system-level write atomicity guarantees beyond a single bind-mounted write.** The host FS handles atomic rename via `os.rename`; that's enough for a tiny markdown file.
- **Out of scope: replacing the `Restart Worker` button with a different "softer" reload action** (e.g. "Reload SOUL.md"). The watcher already does this on file change.
- **Out of scope: redesigning the settings header.** Same kicker (`SYSTEM`) + heading (`settings`) + tagline. Just no Restart button.
- **Out of scope: per-tab deep-linkable URLs as nested routes.** Use search params (`/settings?tab=profile`) — no new TanStack route definitions. Captured as Open Questions for follow-ups.

## Constraints

- **No DB schema change.** All work is at the API endpoint, frontend, and bind-mounted file write level.
- **PUT endpoint must validate the path.** `PUT /api/settings/profile-files/USER.md` only writes to `profile/USER.md` — no `..` traversal, no other filename. Hard-coded allowlist.
- **Hot-reload must continue to work after a dashboard write.** The `chokidar`-based watcher in `apps/worker/src/profile/watcher.ts` listens for file events; an atomic rename triggers it. Verify it doesn't double-fire or race the in-flight agent turn.
- **Constitution principles:**
  - *Reversibility first.* Removing Restart is reversible (revert one PR). Adding the editor is reversible (the textarea + endpoint can be deleted independently). Tabs are reversible (collapse back to vertical sections).
  - *Connectors are the product.* Settings stays a low-traffic page; tabbing is investment in low-traffic chrome. Counterpoint 0067-B questioned the investment. Owner-call: tabs are a small upgrade that makes the page comprehensible at a glance, and we're already touching it for items B and C.
  - *Single source of truth.* Profile name → USER.md is the source. Do not duplicate it elsewhere.
- **Backwards-compatible at `GET /api/settings`.** Adding the `profile` block (from spec 0066) is additive; removing `mcp.json` from `profileFiles` is a breaking change to the response shape. Acceptable because the field is informational only, no client logic depends on its presence; document in the test diff.
- **No worker restart UI fallback elsewhere.** Removing the button means the only path is `docker compose restart` (host) or operator-initiated container kill. Document in About copy.

## User Stories / Scenarios

1. **Operator opens `/settings` for the first time after this spec ships.** Page header: kicker `SYSTEM` + `settings` heading + tagline. Below: tab strip with `profile · capabilities · backend · about` (gold underline under `profile`, the default). Below the strip: the profile tab content (USER.md inline editor + a read-only summary line for SOUL.md and crons.yaml). No restart button anywhere.

2. **Operator clicks `capabilities` tab.** URL becomes `/settings?tab=capabilities`. The page swaps content (no full reload — TanStack Router state) to show the capabilities table. Tab underline moves to `capabilities`. Browser back returns to `?tab=profile`.

3. **Operator edits USER.md.** They type into the inline textarea. As soon as the buffer differs from the saved value, a `Save (⌘S)` button appears in the editor footer + a `unsaved` chip. They press `Cmd+S` (or click the button). The dashboard issues `PUT /api/settings/profile-files/USER.md` with the new body. On 200, the chip disappears, the timestamp updates ("just now"), the watcher reloads the profile in the worker, and the next agent turn uses the new USER.md.

4. **Operator edits but tries to switch tabs without saving.** A `useBlocker` guard pops a confirm dialog: `Discard unsaved changes to USER.md?` (Discard / Cancel). Same on full route navigation away (`/connectors` etc).

5. **Operator hits the dashboard from a deep-link `/settings?tab=about`.** Page mounts directly on `about` tab; profile tab content is unmounted (lazy if needed).

6. **Operator's USER.md is malformed (no parseable frontmatter).** Editor still renders the raw body; save still works (validation is at parse-time downstream). Last-modified timestamp shows the file mtime.

7. **Operator with a half-broken state — they had a Restart Worker workflow scripted in their muscle memory.** They open settings, no button. The About tab has a one-liner: `Worker auto-reloads on profile changes. Use docker compose restart for a hard reset.` They learn the new mental model.

## Success Criteria

**Phase A — settings tabs (item 5a):**
- [ ] `apps/dashboard/src/routes/_authed/settings.tsx` renders a tab strip with **4 tabs** (`profile`, `capabilities`, `backend`, `about`) using the existing Imperial Terminal style: caps mono labels, gold underline on active.
- [ ] Tab order: profile → capabilities → backend → about.
- [ ] Default tab on first mount = `profile`.
- [ ] Active tab is reflected in URL search param `?tab=<id>`. Reading `/settings` (no param) lands on `profile`.
- [ ] Tab content swap is route-state — no full reload, no flash. TanStack Router or local state both acceptable; URL must update either way.
- [ ] All four section components from today (`AgentCapabilitiesSection`, `BackendCard`, `ProfileFileRow`s, `AboutRow`s) keep their existing props/contracts; we restructure the parent, not the children.
- [ ] Each tab is independently deep-linkable: `/settings?tab=backend` lands on the backend tab.

**Phase B — USER.md inline editor (item 5b):**
- [ ] On the `profile` tab, USER.md renders as an inline editor (font-mono `textarea`, growable, `wrap='soft'`, min height ~20 lines, max height ~40 lines, scroll past max).
- [ ] Initial content = current `profile/USER.md` body, fetched via `GET /api/settings`.
- [ ] A `unsaved` chip + `Save (⌘S)` button appear when the buffer differs from the saved value; both disappear on save.
- [ ] `⌘S` / `Ctrl+S` keybinding triggers save when the editor is focused. Captured globally on the `/settings?tab=profile` route — does not bubble to the browser save-page dialog.
- [ ] Save endpoint: `PUT /api/settings/profile-files/USER.md` (Hono route in `apps/api/src/routes/settings.ts`); body is the raw markdown text; response 200 with new mtime + body.
- [ ] Endpoint enforces a hardcoded path allowlist — only `USER.md` writes through. Anything else returns 403.
- [ ] Endpoint atomic-writes via `fs.writeFile` to a tempfile + `fs.rename` to the final path (single `chokidar` event).
- [ ] Last-modified timestamp visible in the editor header (e.g. `edited 2 min ago`); polls or invalidates on save.
- [ ] `useBlocker` from TanStack Router guards intra-app navigation when buffer is dirty; popup: "Discard unsaved changes to USER.md? [Discard / Cancel]".
- [ ] `beforeunload` guard for full-page-leave (window close / tab close / external link).
- [ ] **No markdown preview**, **no other profile file is editable** (SOUL.md and crons.yaml render as read-only rows with a `read-only` badge and brief explanation copy: SOUL.md → "agent identity, version-controlled"; crons.yaml → "legacy static crons; manage via /crons").
- [ ] **`profile/mcp.json` row removed entirely from `profileFiles` response** + dashboard. Update `GET /api/settings` to filter it out OR remove the file row from `apps/dashboard/src/components/settings/profile-file-row.tsx` consumers — implementer picks.

**Phase C — Restart Worker removal (item 5c):**
- [ ] `apps/dashboard/src/routes/_authed/settings.tsx` no longer imports `RestartWorkerModal`, no longer uses `useRestartWorker`, no longer renders `RestartWorkerButton`, no longer holds `showRestart` state.
- [ ] `apps/dashboard/src/components/modals/restart-worker-modal.tsx` deleted.
- [ ] `useRestartWorker` removed from `apps/dashboard/src/lib/mutations.ts`.
- [ ] API route that enqueues the restart command + the worker handler at `apps/worker/src/commands/handlers/restart.ts` deleted.
- [ ] `apps/worker/src/commands/handlers/index.ts` no longer registers `restart`.
- [ ] `commands` table data with `type='restart'` is left intact (don't migrate-delete historical records); the dispatcher just no longer has a handler for that type. New `commands` rows of type `restart` cannot be created — the API route is gone.
- [ ] About tab copy includes one line: `Worker auto-reloads on profile changes. For a hard reset, run docker compose restart from the host.`

**Quality gate:**
- [ ] `pnpm run quality-gate` green.
- [ ] Test count delta: at least +4 (tabs default + tabs deep-link + USER.md save + dirty guard) and -1 (RestartWorkerModal test gone).

**E2E acceptance (Rule 1):**
- [ ] Live `fn` profile dashboard (port 3001): edit `USER.md` via the editor (e.g. add a sentence to the description). Save. Send a Slack message that should reflect the change (e.g. "what's my name?" — agent should pull from updated USER.md within 1-2 turns).
- [ ] Worker logs for the post-edit turn show `profile_reload` event after the dashboard save.
- [ ] Tab navigation: open `/settings`, click each tab, verify URL reflects, browser back works.
- [ ] Restart button absent everywhere (header, modal trigger, command palette if applicable).
- [ ] About tab shows the new auto-reload note.

## Architecture

### Component map

```
apps/api/src/routes/
└── settings.ts                                   # add PUT /profile-files/USER.md; remove restart route; filter mcp.json from profileFiles

apps/dashboard/src/
├── routes/_authed/settings.tsx                   # restructure into tab container + 4 tab panels
├── components/settings/
│   ├── tab-strip.tsx                             # NEW: caps mono tab strip with gold underline (uses existing kicker styles)
│   ├── user-md-editor.tsx                        # NEW: inline textarea + save button + dirty state + Cmd+S + last-modified
│   ├── about-tab.tsx                             # NEW: extracted About content + new auto-reload copy
│   ├── agent-capabilities-section.tsx            # unchanged
│   ├── backend-card.tsx                          # unchanged
│   └── profile-file-row.tsx                      # unchanged (still used for read-only SOUL.md and crons.yaml)
├── components/modals/
│   └── restart-worker-modal.tsx                  # DELETE
├── lib/
│   ├── mutations.ts                              # remove useRestartWorker; add useUpdateUserMd
│   └── use-settings.ts                           # surface SettingsSnapshot.profile from spec 0066
└── tests/
    ├── routes/settings.test.tsx                  # +tabs, +deep-link, +editor, +dirty guard
    └── routes/settings-old-tests.test.tsx        # remove old vertical-stack tests; -RestartWorkerModal cases

apps/worker/src/
└── commands/
    ├── handlers/restart.ts                       # DELETE
    └── handlers/index.ts                         # remove `restart` registration

context/specs/0067-settings-refactor/
├── spec.md                                       # this file
├── plan.md                                       # follow-up
└── tasks.md                                      # follow-up
```

### Data flow — USER.md edit (Phase B)

```
Operator types in textarea
  ↓
buffer state in user-md-editor.tsx is dirty (≠ saved value)
  ↓
"unsaved" chip + Save (⌘S) button render
  ↓
Operator presses ⌘S
  ↓
mutation: PUT /api/settings/profile-files/USER.md  (body: { content: '...' })
  ↓
api/routes/settings.ts:
  - validate path is exactly 'USER.md'
  - validate body is a string ≤ N kB (e.g. 32 kB hard cap)
  - atomic write: tempfile + rename → profile/USER.md
  - return 200 with { mtime, content }
  ↓
chokidar (apps/worker/src/profile/watcher.ts) fires 'change' for profile/USER.md
  ↓
ProfileWatcher.reload() rebuilds system prompt for next agent turn
  ↓
TanStack Query invalidates 'settings' → useSettings() refetches → editor sees new mtime
  ↓
"unsaved" chip disappears; "edited just now" timestamp shows
```

### Data flow — tab navigation (Phase A)

```
Operator clicks `capabilities` tab
  ↓
TabStrip onClick → router.navigate({ to: '/settings', search: { tab: 'capabilities' } })
  ↓
URL becomes /settings?tab=capabilities
  ↓
Settings route reads search param, renders <CapabilitiesTab />
  ↓
TabStrip re-renders with `capabilities` underlined
```

If tab param is unknown or absent, default to `profile`.

### Counterpoint summary (Rule 3)

| Item | Owner stance | Subagent A | Subagent B | Owner final call |
|---|---|---|---|---|
| (A) Tabs | 4 tabs, default = profile, order profile → capabilities → backend → about | Default = capabilities (blast radius first); deep-link each tab | Tabs imply peers; consider accordion | Keep tabs (Imperial Terminal pattern). Default = profile (frequency wins for landing UX). Deep-link via `?tab=` |
| (B) Inline editor | Textarea, no preview, save when dirty | Add Cmd+S, useBlocker, last-modified timestamp; remove mcp.json (lie post-0032); SOUL.md + crons.yaml read-only | All-or-nothing: every profile file editable or none | Accept all of A's adds. Reject B's all-or-nothing — owner-call: USER.md is the only one that needs editing. Mark crons.yaml structured editor as future spec |
| (C) Remove Restart | Just remove | Add About copy: "Worker auto-reloads on profile changes" | Document `docker compose restart` escape hatch | Accept both — combine into one About line: "Worker auto-reloads on profile changes. Use docker compose restart for a hard reset." |

## Test plan

**Unit:**
- `apps/dashboard/tests/routes/settings.test.tsx`:
  - Default tab = `profile` when URL is `/settings` (no param).
  - URL `/settings?tab=capabilities` mounts capabilities tab content.
  - Click tab updates URL search param.
  - USER.md editor: dirty state appears on input, save button + unsaved chip render, save triggers mutation, post-save state clears.
  - `Cmd+S` keypress while editor is focused triggers save; default browser action prevented.
  - `useBlocker` confirm appears on intra-app navigation when buffer is dirty.
  - About tab contains the auto-reload note text.
- `apps/api/tests/routes/settings.test.ts`:
  - `PUT /api/settings/profile-files/USER.md` with valid body returns 200 + new mtime.
  - `PUT /api/settings/profile-files/SOUL.md` returns 403 (allowlist enforcement).
  - `PUT /api/settings/profile-files/../etc/passwd` returns 403 (path traversal blocked).
  - `GET /api/settings` does NOT include `mcp.json` in `profileFiles`.
- Removed: any tests referencing `RestartWorkerModal`, `useRestartWorker`, or the restart command handler.

**Integration:**
- After a `PUT` to USER.md, the worker's profile watcher emits `profile_reload`. Verify via the worker's structured log stream within 500ms.

**Quality gate:**
- `pnpm run quality-gate`: lint + typecheck + test all green.

**E2E (Rule 1):**
- Live `fn` profile dashboard at port 3001:
  - Open `/settings`, default tab = profile, USER.md editor visible.
  - Edit a sentence in USER.md, press Cmd+S. Worker logs show profile reload.
  - Slack message that should reflect the change ("what's my preferred working language?" or similar): agent picks up updated content within next turn.
  - Click each tab, URL updates, browser back works.
  - Verify no Restart Worker button anywhere; About tab has new copy.

## Open Questions

- **[NEEDS CLARIFICATION]** *Should `Cmd+S` save apply globally on the settings route, or only when the editor textarea is focused?* This spec scopes it to the editor focus to avoid accidental triggers from elsewhere. Tested via "click outside textarea, press ⌘S, no save fires."
- **[NEEDS CLARIFICATION]** *Maximum USER.md size?* Hard cap at 32 kB feels generous (current FN USER.md is ~1.5 kB). If someone wants a larger file, ship a follow-up — don't pre-engineer.
- **[NEEDS CLARIFICATION]** *Should crons.yaml become editable in a follow-up spec with a YAML-aware editor (Monaco / CodeMirror with syntax)?* Counterpoint 0067-A suggested yes. Captured as a candidate spec.
- **[NEEDS CLARIFICATION]** *Should profile-tab "read-only" rows for SOUL.md show file body, or just metadata?* Spec defaults to metadata-only (size + mtime + read-only badge). If the operator wants to read SOUL.md from the dashboard, follow-up adds a "view" affordance.
- **[NEEDS CLARIFICATION]** *Tabs as nested routes vs `?tab=` search param?* This spec uses search param to avoid TanStack route file proliferation. Nested routes (`settings.profile.tsx`, `settings.capabilities.tsx`) would deep-link more idiomatically. Captured for follow-up if the routing pattern bothers anyone.
- **[NEEDS CLARIFICATION]** *Counterpoint 0067-B's accordion suggestion — should we revisit?* Tabs ship in this spec. If after one week of use the tabs feel like overkill for a 4-section page, replacing with accordion is a small refactor.

## References

- Backlog raw list (items 5a, 5b, 5c): `context/backlog.md` lines 46-49.
- Today's settings page: `apps/dashboard/src/routes/_authed/settings.tsx`.
- Today's restart modal: `apps/dashboard/src/components/modals/restart-worker-modal.tsx`.
- Today's restart handler: `apps/worker/src/commands/handlers/restart.ts`.
- Profile watcher: `apps/worker/src/profile/watcher.ts`.
- Profile loader (parses USER.md): `apps/worker/src/agent/system-prompt.ts:loadProfileFile`.
- Settings API route: `apps/api/src/routes/settings.ts`.
- DB-as-contract pattern: `context/learnings/db-as-contract-pattern.md`.
- Hot-reload-needs-getter learning: `context/learnings/hot-reload-needs-getter-not-snapshot.md`.
- Spec 0032 (connectors backend, makes mcp.json a lie): `context/specs/0032-connectors-backend/spec.md`.
- Constitution: `context/constitution.md` (reversibility first; one decision at a time).
- Paper file: `zeno-agent` (`01KPYCJ6QXK8Z1PEVQME9262RP`, page `1-0`) — settings artboards F1-0, 2QM-0, 2V1-0, 5WJ-0.
