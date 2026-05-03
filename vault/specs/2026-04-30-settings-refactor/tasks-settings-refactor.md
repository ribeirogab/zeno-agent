---
feature: settings-refactor
plan: "[[plan-settings-refactor]]"
spec: "[[spec-settings-refactor]]"
created: 2026-04-30
---
# 0067 — Settings refactor — Tasks

**For this plan:** `[[plan-settings-refactor]]`

## Phase C: Remove "Restart Worker" (cascade delete)

### Task C1: Delete frontend restart artifacts

- [ ] Step 1: Delete `apps/dashboard/src/components/modals/restart-worker-modal.tsx`.
- [ ] Step 2: In `apps/dashboard/src/lib/mutations.ts` — remove `useRestartWorker` export (and its API call helper).
- [ ] Step 3: In `apps/dashboard/src/routes/_authed/settings.tsx` — remove `RestartWorkerModal` import, `useRestartWorker` import, `restartWorker` const, `showRestart` state, `<RestartWorkerModal>` JSX, `<Header onRestart={...}>` prop, `RestartWorkerButton` component, `RestartIcon` component.
- [ ] Step 4: `pnpm --filter dashboard typecheck` — green (no dangling refs).
- [ ] Step 5: Commit — `feat(dashboard): drop restart-worker UI (spec 0067 C)`.

### Task C2: Delete backend restart route + worker handler

- [ ] Step 1: Find the API route that enqueues `restart` commands (likely in `apps/api/src/routes/settings.ts` or a sibling) — delete that handler block + the route registration.
- [ ] Step 2: Delete `apps/worker/src/commands/handlers/restart.ts`.
- [ ] Step 3: In `apps/worker/src/commands/handlers/index.ts` — remove the `restart` import and its entry from the handler map.
- [ ] Step 4: Verify the dispatcher (`apps/worker/src/commands/dispatcher.ts`) handles "unknown command type" gracefully (silent skip with a log entry). If it throws, add a single-line guard.
- [ ] Step 5: `pnpm --filter @zeno/api typecheck && pnpm --filter @zeno/worker typecheck` — green.
- [ ] Step 6: Commit — `feat(api,worker): drop restart command path (spec 0067 C)`.

### Task C3: Tests cleanup

- [ ] Step 1: Delete `apps/worker/tests/commands/handlers/restart.test.ts` if it exists.
- [ ] Step 2: Remove any `RestartWorker`-related tests from `apps/dashboard/tests/`.
- [ ] Step 3: `pnpm run quality-gate` — green.
- [ ] Step 4: Commit — `test: drop restart-worker tests (spec 0067 C)`.

## Phase A: Settings page in tabs

### Task A1: Build `<TabStrip />` component

- [ ] Step 1: Create `apps/dashboard/src/components/settings/tab-strip.tsx`. Props: `tabs: { id, label }[]`, `activeId`, `onChange(id)`. Render: row of caps-mono labels (text-secondary inactive, gold active) with a 2px gold underline absolutely-positioned under the active tab.
- [ ] Step 2: Match the visual contract from Paper artboard `0067 · /settings · profile (saved)` (see file `zeno-agent` page `1-0`). Padding/spacing/letter-spacing per the Imperial Terminal design.
- [ ] Step 3: Add a unit test rendering 4 tabs and asserting only the active one has the gold underline.
- [ ] Step 4: Commit — `feat(dashboard): tab-strip primitive (spec 0067 A)`.

### Task A2: Restructure `/settings` route

- [ ] Step 1: In `apps/dashboard/src/routes/_authed/settings.tsx` — wire up TanStack Router search param: define `validateSearch` returning `{ tab: 'profile' | 'capabilities' | 'backend' | 'about' }` with default `'profile'`.
- [ ] Step 2: Read `tab` via `useSearch()` from the route. Render `<TabStrip>` with the 4 tabs and `onChange` calling `navigate({ search: { tab: id } })`.
- [ ] Step 3: Below the TabStrip, render the active tab's content:
  - `profile` → existing `<ProfileFilesSection>` (B1 will replace USER.md row with the editor, but for now keep the read-only rows so this PR phase is shippable independently).
  - `capabilities` → existing `<AgentCapabilitiesSection>`.
  - `backend` → existing `<BackendSection>`.
  - `about` → existing `<AboutSection>` (B3 will add the auto-reload note).
- [ ] Step 4: Verify deep-link works: `localhost:3000/settings?tab=backend` lands on backend tab.
- [ ] Step 5: Verify browser back returns to previous tab.
- [ ] Step 6: Commit — `feat(dashboard): settings page in tabs (spec 0067 A)`.

### Task A3: Tests for tabs

- [ ] Step 1: In `apps/dashboard/tests/routes/settings.test.tsx` — test default `/settings` lands on `profile` tab.
- [ ] Step 2: Test `/settings?tab=capabilities` lands on capabilities tab content (assert capability table renders, profile rows don't).
- [ ] Step 3: Test clicking a tab updates the URL search param (use the router's history mock).
- [ ] Step 4: `pnpm --filter dashboard test -- settings` — green.
- [ ] Step 5: Commit — `test(dashboard): cover settings tab navigation (spec 0067 A)`.

## Phase B: USER.md inline editor + drop mcp.json

### Task B1: API — `PUT /api/settings/profile-files/USER.md`

- [ ] Step 1: In `apps/api/src/routes/settings.ts` — add a `PUT` route. Hardcoded path allowlist: only `'USER.md'` accepted; anything else returns 403.
- [ ] Step 2: Read body as `{ content: string }`. Reject if `content.length > 32768` (32 kB cap) — 413 Payload Too Large.
- [ ] Step 3: Atomic write: `fs.writeFile('profile/USER.md.tmp', content)` then `fs.rename(...tmp, ...USER.md)`. Wrap in try/catch — clean up tempfile on error, return 500.
- [ ] Step 4: Return 200 `{ mtime: <new ISO string>, content: <body> }`.
- [ ] Step 5: Verify via curl: `curl -X PUT localhost:3000/api/settings/profile-files/USER.md -d '{"content":"# test"}'` returns 200 with new mtime; `cat profile/USER.md` shows the new content.
- [ ] Step 6: Commit — `feat(api): PUT /api/settings/profile-files/USER.md (spec 0067 B)`.

### Task B2: API — drop mcp.json from `profileFiles`

- [ ] Step 1: In `apps/api/src/routes/settings.ts` — find where `profileFiles` is built. Filter out the entry for `mcp.json` (or just remove it from the source list).
- [ ] Step 2: `curl localhost:3000/api/settings | jq '.profileFiles[].path'` — verify `mcp.json` is gone, USER.md / SOUL.md / crons.yaml still present.
- [ ] Step 3: Commit — `feat(api): drop mcp.json from profileFiles response (spec 0067 B)`.

### Task B3: API tests

- [ ] Step 1: In `apps/api/tests/routes/settings.test.ts` — add `PUT /api/settings/profile-files/USER.md` happy-path test. Verify file content + response shape.
- [ ] Step 2: Add path-allowlist test: `PUT /api/settings/profile-files/SOUL.md` returns 403.
- [ ] Step 3: Add path-traversal test: `PUT /api/settings/profile-files/../etc/passwd` returns 403 (or whatever Hono normalizes it to — verify it never escapes the profile dir).
- [ ] Step 4: Add size-cap test: PUT with 33 kB body returns 413.
- [ ] Step 5: Update existing GET test to assert `profileFiles` does NOT include `mcp.json`.
- [ ] Step 6: `pnpm --filter @zeno/api test -- settings` — green.
- [ ] Step 7: Commit — `test(api): cover PUT USER.md + path-allowlist + size-cap (spec 0067 B)`.

### Task B4: Frontend — `<UserMdEditor />` component

- [ ] Step 1: Create `apps/dashboard/src/components/settings/user-md-editor.tsx`. Props: initial `content`, initial `mtime`. Internal state: `buffer` (mirrors textarea), `dirty = buffer !== content`.
- [ ] Step 2: Render: section header with title `USER.md` + path/size + (if saved) timestamp `EDITED <relative> · SAVED` OR (if dirty) `EDITED JUST NOW` + unsaved chip + `SAVE ⌘S` button.
- [ ] Step 3: Editor body: bordered panel with gutter (`MARKDOWN · READ-WRITE` + `⌘S to save · soft-wrap on`) and a `<textarea>` (font-mono 13px, growable, soft-wrap). Use `<pre>` with `white-space: pre-wrap` if textarea breaks shape.
- [ ] Step 4: Wire `useUpdateUserMd` mutation (Phase B5) on the Save button + `Cmd+S` keybind (window-level, scoped to when the editor is mounted+focused).
- [ ] Step 5: Match the Paper artboard `0067 · /settings · profile (dirty)` for visual contract.
- [ ] Step 6: Commit — `feat(dashboard): UserMdEditor component (spec 0067 B)`.

### Task B5: Frontend — `useUpdateUserMd` mutation + dirty guard

- [ ] Step 1: In `apps/dashboard/src/lib/mutations.ts` — add `useUpdateUserMd()` (TanStack Query mutation). On success: invalidate `['settings']` query.
- [ ] Step 2: Use `useBlocker` from `@tanstack/react-router` in `<UserMdEditor />` — when `dirty===true`, show a confirm dialog on intra-app navigation. Dialog: "Discard changes to USER.md?" (matches Paper `M-discard-confirm`).
- [ ] Step 3: Add `beforeunload` event handler: if dirty, browser shows native warning on tab close / page refresh. Cleanup on unmount.
- [ ] Step 4: Commit — `feat(dashboard): useUpdateUserMd mutation + dirty guards (spec 0067 B)`.

### Task B6: Wire UserMdEditor into profile tab

- [ ] Step 1: In the profile tab content of `apps/dashboard/src/routes/_authed/settings.tsx` — replace the USER.md `<ProfileFileRow>` with `<UserMdEditor />`.
- [ ] Step 2: Keep `<ProfileFileRow>` for SOUL.md and crons.yaml — add a `read-only · committed` (or similar) chip. Update the row to render the chip per the Paper artboard `0067 · /settings · profile (saved)`.
- [ ] Step 3: Commit — `feat(dashboard): wire USER.md editor in profile tab (spec 0067 B)`.

### Task B7: Frontend tests

- [ ] Step 1: Test that typing in the editor toggles the unsaved chip + save button.
- [ ] Step 2: Test that Cmd+S triggers the mutation when the editor is focused.
- [ ] Step 3: Test that Cmd+S does NOT trigger when the editor is unfocused.
- [ ] Step 4: Test that the dirty guard blocks navigation (mock `useBlocker`).
- [ ] Step 5: Test that on save success, dirty resets and the timestamp updates.
- [ ] Step 6: `pnpm --filter dashboard test -- user-md-editor` — green.
- [ ] Step 7: Commit — `test(dashboard): cover UserMdEditor (spec 0067 B)`.

### Task B8: About tab — add hot-reload note

- [ ] Step 1: Create `apps/dashboard/src/components/settings/about-tab.tsx` (or extend the existing about content). Add a green-bordered callout (matches Paper `0067 · /settings · about`):
  - Kicker: `HOT-RELOAD`
  - Body: `Worker auto-reloads on profile changes. For a hard reset, run docker compose restart from the host.`
- [ ] Step 2: Commit — `feat(dashboard): hot-reload note on about tab (spec 0067 B)`.

## Phase D: Quality gate + manual E2E

### Task D1: Quality gate

- [ ] Step 1: `pnpm run quality-gate` — all turbo tasks green.

### Task D2: Live E2E in Docker against the `fn` profile (Rule 1)

- [ ] Step 1: Build + boot the fn profile container: `PROFILE=fn pnpm run docker:build && PROFILE=fn pnpm run docker:up`.
- [ ] Step 2: Open `http://localhost:3001/settings`. Verify:
  - Default tab is `profile`.
  - Click each tab → URL updates with `?tab=` and content swaps.
  - No "Restart Worker" button anywhere.
  - About tab shows the hot-reload note.
  - profile tab: `mcp.json` is NOT listed in profile files.
- [ ] Step 3: On profile tab, edit USER.md: change a sentence. Verify:
  - "unsaved" chip appears.
  - "save (⌘S)" button appears.
  - Cmd+S triggers save.
  - After save: chip disappears, timestamp updates, no error toasts.
- [ ] Step 4: While dirty, click another tab. Verify confirm dialog appears.
- [ ] Step 5: Save → in Slack, ping `@zeno-agent` with a message that should reflect the change ("what's my preferred working language?" if you edited that line). Verify next turn uses the updated USER.md content.
- [ ] Step 6: Worker logs (`pnpm run docker:logs` filtered) show `profile_reload` event after the dashboard save.

### Task D3: Open PR via `/open-pr`

- [ ] Step 1: Confirm with owner before pushing.
- [ ] Step 2: Use `/open-pr` slash command.
- [ ] Step 3: PR title format: `feat: settings refactor — tabs + USER.md editor + drop restart (spec 0067)`.
