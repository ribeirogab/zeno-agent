---
feature: settings-refactor
spec: "[[spec-settings-refactor]]"
created: 2026-04-30
---
# 0067 — Settings refactor — Plan

**For this spec:** `[[spec-settings-refactor]]`

## Approach

Three independent changes to `/settings` ship together because they all touch the same route file and have no overlap with other surfaces. Each is reversible on its own.

**Phase A (tabs)** restructures `apps/dashboard/src/routes/_authed/settings.tsx` from a vertical scroll into a tab container reading the active tab from a `?tab=` URL search param. The four section components today (`AgentCapabilitiesSection`, `BackendCard`, profile-files rows, About rows) keep their props/contracts; only the parent's layout changes. TanStack Router's `useSearch()` + `useNavigate()` give us deep-linkable tabs without spawning new route files. Default tab = `profile`.

**Phase B (USER.md inline editor)** is the only sub-phase that touches the worker boundary. We add `PUT /api/settings/profile-files/USER.md` to the API — hardcoded path allowlist, atomic write via tempfile + rename, returns the new mtime. The dashboard adds a `<UserMdEditor />` component on the profile tab: textarea (font-mono, growable), buffer state with a dirty flag, save button + unsaved chip when dirty, `Cmd+S` keybind, last-modified timestamp from API response. `useBlocker` from TanStack Router guards intra-app navigation when dirty; `beforeunload` guards page-leave. We also strip the `mcp.json` row from `profileFiles` in the API response (post-spec-0032 it's a teaching lie). SOUL.md and crons.yaml stay as read-only rows with a `read-only` badge.

**Phase C (remove Restart Worker)** is a pure cascade-delete. Frontend (`RestartWorkerButton` + `RestartWorkerModal` + `useRestartWorker`), API (the route that enqueues `restart` commands), and worker (`commands/handlers/restart.ts` + its registration in `commands/handlers/index.ts`) all go. Existing `commands` rows of type `restart` stay in the DB (historical record); new ones can't be created because the API path is gone. The About tab gains one line: `Worker auto-reloads on profile changes. For a hard reset, run docker compose restart from the host.`

The brainstorm consolidated counterpoints into the spec's "Counterpoint summary" — owner picked tabs over accordion (Imperial Terminal aesthetic), profile-default over capabilities-default (frequency over blast-radius for landing UX), and only-USER.md-editable over all-or-nothing (pragmatism — USER.md is the only file that legitimately changes via this UI).

## Architecture

```
apps/api/src/routes/settings.ts
  ├─ GET response: drop mcp.json from profileFiles
  └─ NEW: PUT /api/settings/profile-files/USER.md
         (hardcoded allowlist, atomic write, returns { mtime, content })

apps/dashboard/src/routes/_authed/settings.tsx
  ├─ replace vertical sections with TabContainer
  ├─ tab state from `useSearch()` (?tab=profile|capabilities|backend|about)
  ├─ default tab = 'profile'
  └─ drop RestartWorkerModal import + state + button

apps/dashboard/src/components/settings/
  ├─ tab-strip.tsx                     # NEW: caps-mono labels, gold underline on active
  ├─ user-md-editor.tsx                # NEW: textarea + dirty + Cmd+S + last-modified
  ├─ about-tab.tsx                     # NEW: extracts About rows + auto-reload note
  ├─ agent-capabilities-section.tsx    # unchanged (used inside capabilities tab)
  ├─ backend-card.tsx                  # unchanged (used inside backend tab)
  └─ profile-file-row.tsx              # unchanged (still used for SOUL.md + crons.yaml read-only rows)

apps/dashboard/src/components/modals/restart-worker-modal.tsx
  └─ DELETE

apps/dashboard/src/lib/mutations.ts
  ├─ remove useRestartWorker
  └─ add useUpdateUserMd

apps/worker/src/commands/handlers/restart.ts
  └─ DELETE

apps/worker/src/commands/handlers/index.ts
  └─ remove `restart` registration
```

Data flow — USER.md edit:

```
operator types in <textarea>
  ↓
buffer state (≠ saved value) → dirty=true
  ↓
"unsaved" chip + "save (⌘S)" button render
  ↓
Cmd+S OR click Save
  ↓
PUT /api/settings/profile-files/USER.md  body: { content: '...' }
  ↓
api validates path === 'USER.md'
api validates body length ≤ 32 kB
api atomic-writes: tempfile → rename → profile/USER.md
api returns 200 { mtime, content }
  ↓
profile watcher (chokidar) fires 'change' event
  ↓
ProfileWatcher.reload() rebuilds system prompt for next agent turn
  ↓
TanStack Query invalidates 'settings' → useSettings refetches
  ↓
"unsaved" chip disappears; "edited just now" timestamp updates
```

Data flow — tab navigation:

```
operator clicks 'capabilities' tab
  ↓
router.navigate({ to: '/settings', search: { tab: 'capabilities' } })
  ↓
URL → /settings?tab=capabilities
  ↓
settings route reads useSearch().tab → renders <CapabilitiesTab />
  ↓
TabStrip re-renders with 'capabilities' underlined
  ↓
browser back returns to ?tab=profile
```

## File Structure

| File | Change |
|---|---|
| `apps/api/src/routes/settings.ts` | (1) drop mcp.json from `profileFiles`. (2) Add `PUT /api/settings/profile-files/USER.md` with allowlist + atomic write. (3) Remove the restart route. |
| `apps/api/tests/routes/settings.test.ts` | +PUT happy path. +PUT path-allowlist 403. +PUT path-traversal 403. +GET shape excludes mcp.json. -RestartWorker-related tests. |
| `apps/dashboard/src/routes/_authed/settings.tsx` | Restructure into TabContainer; drop RestartWorker. |
| `apps/dashboard/src/components/settings/tab-strip.tsx` | **NEW** |
| `apps/dashboard/src/components/settings/user-md-editor.tsx` | **NEW** |
| `apps/dashboard/src/components/settings/about-tab.tsx` | **NEW** |
| `apps/dashboard/src/components/modals/restart-worker-modal.tsx` | **DELETE** |
| `apps/dashboard/src/lib/mutations.ts` | -useRestartWorker; +useUpdateUserMd |
| `apps/dashboard/src/lib/use-settings.ts` | (already gains `profile` field from spec 0066 — coordinate timing) |
| `apps/dashboard/tests/routes/settings.test.tsx` | +tab default + tab deep-link + editor dirty + Cmd+S + useBlocker. -RestartWorker tests. |
| `apps/worker/src/commands/handlers/restart.ts` | **DELETE** |
| `apps/worker/src/commands/handlers/index.ts` | Remove restart registration |
| `apps/worker/tests/commands/handlers/restart.test.ts` (if exists) | **DELETE** |

## Phase Ordering

1. **Phase C (remove restart)** first — pure deletes, smallest blast radius. Reduces noise in subsequent diffs.
2. **Phase A (tabs)** second — UI scaffolding for the page. Profile tab content = the existing `profileFiles` rows for now (USER.md still read-only).
3. **Phase B (USER.md editor + drop mcp.json)** third — adds the only new functionality. Splits cleanly into B1 (api endpoint + tests) → B2 (dashboard editor + dirty/save) → B3 (drop mcp.json from response).

Each phase ends with `pnpm run quality-gate` green. Stage commits per phase.

## Risks / Open Decisions

- **Coordinating with spec 0066's `useSettings.profile` field**: both PRs touch `use-settings.ts`. Land 0066 first (smaller, less risky), then 0067 builds on top. Or merge into one branch if both are ready together — the type extension is additive.
- **`Cmd+S` global vs editor-focused**: spec ties it to editor focus. Verify: clicking outside textarea + pressing ⌘S does NOT trigger save (browser default also blocked while on /settings?tab=profile? — we may need a route-level handler).
- **Path-allowlist rigor in `PUT`**: `path === 'USER.md'` is an exact match — reject anything else (incl. `./USER.md`, `USER.md/../etc/passwd`). Tests must include path-traversal attempts.
- **Atomic write strategy**: `fs.writeFile` to `USER.md.tmp` then `fs.rename`. On error mid-write, the original file is untouched. Don't write directly with `fs.writeFile(USER.md, ...)` — interrupted writes corrupt.
- **Hot-reload race with the in-flight agent turn**: chokidar fires ~ms after the rename. If a Slack message is being processed at the same instant, the next-turn-only model means the in-flight turn uses the old USER.md (acceptable; consistent with current behavior).
- **`useBlocker` import path**: TanStack Router exposes it from `@tanstack/react-router`. Confirm the version in `apps/dashboard/package.json` supports it.
- **Removing the `restart` command type entirely**: the `commands` table allows any `type` string. Old rows with `type='restart'` stay. The dispatcher (`apps/worker/src/commands/dispatcher.ts`) will silently no-op them since there's no handler — verify this doesn't crash boot. If it does, add a single-line guard.
- **`browser_take_screenshot` vs `browser_snapshot` for the agent's preferred path**: not strictly in scope of 0067, but flagged for cross-check with 0066's Playwright trim — both stay enabled per 0066.
- **Read-only badge UX for SOUL.md / crons.yaml**: keep existing `ProfileFileRow` and add a small `read-only · committed` (or `legacy`) chip. If the Paper artboard wants a richer "view" affordance, that's a follow-up.
