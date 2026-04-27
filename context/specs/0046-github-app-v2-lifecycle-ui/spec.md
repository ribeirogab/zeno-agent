---
status: approved
feature: github-app-v2-lifecycle-ui
created: 2026-04-27
shipped: null
---
# GitHub App v2 — Lifecycle UI Spec

**Status:** Draft
**Scope:** Dashboard UI for the github-app v2 lifecycle modals — add installation (auto-discover + manual fallback), rotate PEM, edit env_var, remove installation, uninstall App. Implements artboards M7, M8, M9, M10, M11 (per spec 0043) + a NEW M12 (uninstall App) introduced here. Also patches spec 0043 in two places: M7 artboard revision (single-select → multi-select) and M11 copy revision ("next worker tick" → "within ~2 seconds").

Depends on spec 0044 (backend) and 0045 (install + listing/detail). C9 (App detail empty state) — already designed in 0043 — gets its CTA wired to M7 in this spec.

## Brainstorm Q&A

User delegated decisions to AI for this spec onward, with constraints: "best for zeno-agent overall, not easiest"; "open-source ready — anyone configures via dashboard without touching yaml/code".

### Q1 — Cache of `/app/installations` discovery results

**Decision: TanStack Query 5min stale-time + refetch on focus/reconnect.**

Rationale:
- TanStack Query is already the dashboard's data layer; using its native cache is the OSS-friendly choice (no custom infra, no maintenance burden).
- 5min stale-time covers the common case (user opens M7 multiple times in a row while configuring) without being so long that real changes (org admin installs the App in a new org while user is in the dashboard) go unnoticed.
- Refetch on window focus catches the scenario where user adds App to GitHub in another tab and comes back.
- Manual refresh button inside M7 ("↻") for explicit override.
- Alternative considered: no cache, fetch every open. Rejected — wasteful (~500ms per open) without meaningful gain.

### Q2 — Dashboard update pattern post-lifecycle-mutation

**Decision: Optimistic updates + background refetch.**

For each mutation:
- **Add installation**: M7 closes → `setQueryData(['app', appId], ...)` adds the new installation row to the cached App detail → C8 re-renders instantly with new row. Background refetch (~500ms later) confirms or rolls back.
- **Remove installation**: M10 closes → `setQueryData` removes the row → C8 re-renders. Background refetch confirms.
- **Rotate PEM**: M9 closes → `setQueryData` updates `pemSha256` + `pemRotatedAt` → C8 re-renders. Background refetch confirms.
- **Edit env_var**: M11 closes → `setQueryData` updates the installation row's `envVar` field → C8/C10 re-renders. Background refetch confirms.
- **Uninstall App**: M12 confirms → navigate to `/connectors` → optimistic removal of the App row from listing.

Rationale:
- Zero perceived latency — feels instant.
- TanStack Query handles rollback if backend rejects.
- More code than naive "refetch on success" (Option A) but the snappiness is worth it for a dashboard the operator uses repeatedly. OSS users will appreciate the polish.
- WebSocket/SSE realtime (Option C) would require new infrastructure (Hono SSE endpoint, browser EventSource setup, deployment considerations for OSS hosters); too much for v1.

### Q3 — M7 selection model

**Decision: Multi-select with checkboxes; backend endpoint stays singular; dashboard parallelizes calls.**

Patches spec 0043's M7 artboard description:
- "1 selectable + 4 already-wired" → "checkboxes per row, multi-select; already-wired rows disabled-checked"
- The selected count drives the gold CTA: "+ ADD 3 INSTALLATIONS" (dynamic).
- Per-row install status during apply: spinner → ✓ added (green) | ✗ failed (red) with inline error.

Backend behavior: dashboard fires `POST /catalog/github-app/installations` for each selected installation in parallel (Promise.all). Atomic per-installation; if one fails, others succeed. Failure UI: row stays in the list with red inline error and a retry button. User can fix and retry without re-doing the success rows.

Rationale:
- Industry-standard for "pick from a list" (GitHub teams, Slack channel pickers, etc.).
- Single-select forces N round trips through the modal if user wants N installations — bad OSS UX.
- All-or-nothing batch endpoint (singular endpoint with array body) is rejected because partial-success-with-retry is the better UX (user sees which failed, fixes one, doesn't redo all).

### Q4 — `TEST INSTALLATION` button on C10

**Decision: Reuses existing `POST /api/connectors/:id/test` endpoint.**

Spec 0044 fixes the broken behavior for `github-app-*` slugs by extending the mcp-build intercept to the refresh-tools path. From the dashboard's perspective, the button works the same as Linear's TEST CONNECTION: spinner → ✓ N tools detected (~Xms) | ✗ errorKind: auth/timeout/etc.

No new endpoint. Visual states already in the design system (artboard 21 — Inline action states).

### Q5 — Edit env_var (M11) timing copy revision

**Decision: M11 modal copy revised from "applies on next worker tick (~30s)" to "applies within ~2 seconds (next command tick)".**

Patches spec 0043 M11 artboard:
- Old: `applies on next worker tick (~30s)`
- New: `applies within ~2 seconds (next command tick)`

Backend reality: `connector_update` command is processed every 1s (commands_poller `tickMs: 1000`). Worker calls `githubApp.renameInstallation()` which immediately updates `process.env`. Skills using the old env var name will see it unset within ~1-2s of clicking SAVE.

Rationale: misleading copy creates confusion. The 30s figure was speculative. Revised copy is honest about the actual latency (which is fast) and explains the breakage window for in-flight skills. Modal warning copy adds: "skills mid-execution may briefly see undefined env var".

### Q6 — M12 (uninstall App) — new modal

**Decision: Add as a new artboard M12 in the Paper file. Pattern matches M9/M10 (destructive confirm with type-to-confirm). Type-to-confirm value = App name in Fraunces italic gold.**

M12 design:
- Title: "Uninstall *Acme Bot*" (App name in italic gold; reads as a sentence with a real name)
- DESTRUCTIVE pill (red).
- Warning callout listing exact consequences:
  - 4 installation connectors deleted (cascade).
  - 4 env vars unset (ACME_GH_TOKEN, etc.) — affects N skills currently referencing them.
  - All cached installation tokens revoked.
  - PEM permanently deleted from DB (cannot be recovered without re-uploading).
  - **App on GitHub stays installed** — re-import via auto-discover anytime.
- Type-to-confirm field labeled: `type the App name "Acme Bot" to confirm`.
- Footer: CANCEL · UNINSTALL APP (red CTA).

Rationale:
- Same destructive pattern as M9/M10 (consistency).
- Type App name (not App ID): more memorable, has visual weight (italic gold echoes the modal title), aligns with GitHub's pattern (type repo name to delete repo).
- Risk of confusion if user has multiple Zeno Apps in OSS multi-app future: type-to-confirm uses the specific App's name from `connector_apps.app_name` (set at install time from GitHub's `/app` response), so it's always the user's actual App name.

### Q7 — PEM file picker UX (M6 and M9)

**Decision: Drag-drop + click-to-pick + paste-to-textarea. All three input methods supported on the same field.**

Component: `react-dropzone` (industry-standard, ~10KB, well-tested). Dropzone wraps the textarea; dropping a `.pem` file fills it. Click on the dropzone area opens native file picker. Paste in the textarea works as before.

Validation: file must end with `.pem` or `.key` extension (warning, not blocker). Content validated regardless via `BEGIN ... PRIVATE KEY` regex + sha256 fingerprint computation.

Rationale:
- Drag-drop is expected UX in modern SaaS dashboards.
- Three input methods cover all usage patterns (terminal users paste; GUI users drag-drop or click).
- `react-dropzone` is well-maintained, accessibility-friendly, no accessibility holes.

## Context

Specs 0043 (visual design), 0044 (backend), 0045 (install + listing/detail UI) precede this. After 0045 ships, the dashboard has:
- Listing with collapsed App row (C7).
- App detail page populated (C8) with installations table + app config + REVEAL/ROTATE buttons.
- Per-installation detail page (C10) with TEST INSTALLATION button + tool permissions.
- M6 (first install modal).
- C9 (App detail empty state) rendered as a stub with "use lifecycle modals (coming in spec 0046) to add" copy.

This spec wires the buttons:
- C9's "+ ADD YOUR FIRST INSTALLATION" → M7
- C8's "+ ADD INSTALLATION" → M7
- C8's "ROTATE" (PEM block) → M9
- C8's installation row kebab menu → M10 (remove) or M11 (edit env_var)
- C8's App-level kebab menu → M12 (uninstall App)

## Non-Goals

1. **always_sensitive UI** (spec 0047). M10's consequences list mentions "always_sensitive entries auto-removed" — implementation of that auto-removal is in 0047 (auto-cascade trigger when an installation is removed).
2. **Connector polish** (spec 0048).
3. **Multi-app support** (still single per Zeno install, enforced in 0044's install endpoint).
4. **OAuth flow** (still deferred).

## Constraints

- **OSS readiness**: every label, copy, error message, and confirmation prompt is parameterized by data from `connector_apps` (App name, ID, slug). No hardcoded text references to `acme-bot` or `operator`. Test data uses fictional values (`Acme Corp`, `12345`).
- **Dependencies**: 0044 backend + 0045 install UI must be shipped before this spec.
- **Reuse design system**: no new primitives. M12 is a duplicate of M10's destructive-modal-with-type-to-confirm pattern with App-level scope.
- **TanStack Query** for all list/detail/mutation interactions. Optimistic updates use `setQueryData`.
- **Accessibility**: focus management on modal open/close, escape-to-close, type-to-confirm uses native input (screen-reader-friendly), drag-drop has keyboard-equivalent (file picker).

## Files Created

- `apps/dashboard/src/components/connectors/install-modals/github-app-add-installation-modal.tsx` — M7 (auto-discover with multi-select)
- `apps/dashboard/src/components/connectors/install-modals/github-app-add-installation-manual-modal.tsx` — M8 (manual fallback)
- `apps/dashboard/src/components/connectors/lifecycle-modals/github-app-rotate-pem-modal.tsx` — M9
- `apps/dashboard/src/components/connectors/lifecycle-modals/github-app-remove-installation-modal.tsx` — M10
- `apps/dashboard/src/components/connectors/lifecycle-modals/github-app-edit-env-var-modal.tsx` — M11
- `apps/dashboard/src/components/connectors/lifecycle-modals/github-app-uninstall-app-modal.tsx` — M12 (new)
- `apps/dashboard/src/components/shared/pem-dropzone.tsx` — reusable PEM input (drag-drop + click + paste-textarea), used by M6 (already shipped in 0045) and M9 (this spec). Refactor M6 to use it post-ship.
- `apps/dashboard/src/components/shared/type-to-confirm.tsx` — reusable type-to-confirm input (input matches expected value to enable submit).
- `apps/dashboard/src/lib/use-discover-installations.ts` — TanStack Query hook with 5min staleTime
- `apps/dashboard/src/lib/use-add-installation.ts` — mutation hook with optimistic update
- `apps/dashboard/src/lib/use-remove-installation.ts` — mutation hook with optimistic update
- `apps/dashboard/src/lib/use-rotate-pem.ts` — mutation hook
- `apps/dashboard/src/lib/use-rename-env-var.ts` — mutation hook
- `apps/dashboard/src/lib/use-uninstall-app.ts` — mutation hook (navigates to /connectors after success)
- `apps/dashboard/tests/components/connectors/github-app-add-installation-modal.test.tsx`
- `apps/dashboard/tests/components/connectors/github-app-rotate-pem-modal.test.tsx`
- `apps/dashboard/tests/components/connectors/github-app-uninstall-app-modal.test.tsx`
- `apps/dashboard/tests/components/shared/pem-dropzone.test.tsx`
- `apps/dashboard/tests/components/shared/type-to-confirm.test.tsx`
- `apps/api/tests/routes/connectors-app-rotate-pem.test.ts`
- `apps/api/tests/routes/connectors-app-uninstall.test.ts`

## Files Modified

- `apps/dashboard/src/components/connectors/app-detail/app-config-section.tsx` (created in 0045) — wire ROTATE button to M9; add App-level kebab menu with "Uninstall App" → M12.
- `apps/dashboard/src/components/connectors/app-detail/installations-table.tsx` (created in 0045) — two responsibilities: (1) wire installation row kebab menu to M10 (Remove) + M11 (Edit env var); (2) wire "+ ADD INSTALLATION" CTA in section header to M7.
- `apps/dashboard/src/components/connectors/app-detail/app-detail-empty.tsx` (the C9 stub from 0045) — wire "+ ADD YOUR FIRST INSTALLATION" CTA to M7.
- `apps/dashboard/src/components/connectors/install-modals/github-app-install-modal.tsx` (M6 from 0045) — refactor to use the new `pem-dropzone` shared component.
- `apps/api/src/routes/connectors.ts` — three changes:
  1. **Extend `patchSchema`** to include `envVar: z.string().regex(/^[A-Z][A-Z0-9_]*$/).optional()`. The existing schema (lines 153-160) has no envVar field; without this, the M11 PATCH body `{envVar: 'NEW_NAME'}` would be silently stripped by `zValidator`, breaking the rename flow at the API boundary.
  2. **Verify rotate-pem endpoint** accepts `confirmAppId` (added in 0044).
  3. **Add uninstall-app endpoint** with body `{confirmAppName}` (NOT `confirmAppId` — see Patches to spec 0044 below).
- `agent/connectors-catalog.json` — no changes (the catalog entry for github-app stays the same).

## API Endpoints

All endpoints exist (or are spec'd) in 0044. Confirming they're consumed correctly here:

| Endpoint | Used by | Notes |
|---|---|---|
| `POST /catalog/github-app/installations/discover` | M7 | TanStack Query 5min cache |
| `POST /catalog/github-app/installations` | M7 + M8 | Singular; dashboard parallelizes for multi-select. Body: `{installationId, displayName, envVar}` |
| `POST /catalog/github-app/rotate-pem` | M9 | Body: `{newPem, confirmAppId}`. Sync validation + atomic update. |
| `POST /catalog/github-app/uninstall-app` | M12 | Body: `{confirmAppName}`. CASCADE deletes connectors. |
| `DELETE /api/connectors/:id` (existing) | M10 | github-app-* slug routes through `connector_uninstall` handler → `githubApp.removeInstallation()`. |
| `PATCH /api/connectors/:id` (existing) | M11 | Body: `{envVar: 'NEW_NAME'}`. github-app-* slug routes through `connector_update` handler → `githubApp.renameInstallation()`. |

## User Stories / Scenarios

| ID | Surface | Description |
|---|---|---|
| LF1 | C9 → M7 | User installs App fresh (M6) → lands on C9 empty state → clicks "+ ADD YOUR FIRST INSTALLATION" → M7 opens with discovery list (5min cached). User checks 3 of 5 installations → CTA "+ ADD 3 INSTALLATIONS" → click → 3 parallel POSTs → 3 ✓ rows → modal closes → C8 detail page now shows 3 installations. |
| LF2 | M7 multi-select with partial failure | User selects 4 installations. 3 succeed; 1 fails (mock: GitHub returned 404 — installation revoked between discover and add). Modal shows 3 ✓ + 1 ✗ inline error "Installation no longer accessible". User clicks ✗ row's retry button → fails again → user clicks Cancel and verifies in GitHub admin. |
| LF3 | M7 manual fallback | User clicks "Add manually" link → switches to M8 → enters {displayName, installationId, envVar} → click TEST → success ✓ → click ADD INSTALLATION → POST → success → C8 shows new installation. |
| LF4 | M9 rotate PEM happy path | User clicks ROTATE in C8 → M9 opens. Drags new .pem file onto dropzone → fingerprint computed inline ✓ valid PEM. Types "12345" (the App ID) to confirm → ROTATE KEY enabled → click → backend validates new PEM (sign JWT, call /app, mint test tokens for all installations) → success → atomic UPDATE → invalidate caches → return 200 → modal closes → C8 shows updated `pemSha256` + `pemRotatedAt` instantly (optimistic). |
| LF5 | M9 rotate PEM with mid-flight skill | User clicks ROTATE while a skill is mid-execution using the old token. Old token (cached, ~50min remaining TTL) continues to work for that skill until next refresh. New skills started after rotation use new tokens. No user-visible failure. |
| LF6 | M10 remove installation | User clicks installation row's kebab in C8 → "Remove" → M10 opens with consequences list (BREAK: env var unset, mcp tools removed; KEEP: app credentials, other installations). Types installation name → REMOVE INSTALLATION → DELETE → optimistic update → row gone from C8. |
| LF7 | M11 rename env_var | User clicks installation row's kebab in C8 → "Edit env var" → M11 opens with current `ACME_GH_TOKEN` (struck through) and new `FNLIVROS_GH_TOKEN` (gold border). Warning shows "2 skills currently reference ACME_GH_TOKEN". Click SAVE → PATCH → response 200 → modal closes (~2s for command tick to apply) → C8 row shows new env var. |
| LF8 | M12 uninstall App | User clicks App-level kebab in C8 → "Uninstall App" → M12 opens with red destructive border, full consequences. Types "Acme Bot" (App name) → UNINSTALL APP → backend CASCADE deletes 4 installations + connector_apps row → worker `app_uninstall` command tears down `GitHubAppAuth` → optimistic update removes App from listing → navigate to `/connectors` → only Personal github connector remains visible. |

## Patches to spec 0044

Spec 0044's API endpoint table at line 233 documents `POST /catalog/github-app/uninstall-app` with body `{confirmAppId}`. This spec (0046) supersedes that to **`{confirmAppName}`** for M12. Rationale per Q6: type-to-confirm with App name is more memorable and visually consistent with M9/M10's pattern (italic gold display values).

Implementation note: spec 0044's spec.md will get a 1-line patch in this spec's Phase 1 ("authoritative body for uninstall-app: see spec 0046 §Q6").

The M9 rotate-pem endpoint stays at `{confirmAppId}` (numeric) because numeric is robust against App rename and the rotate-PEM modal already shows the App ID as the visual anchor (per M9 artboard).

## Patches to spec 0043

This spec patches 0043's artboard descriptions (1-line edits) WITHOUT regenerating the PNGs (the visual content of M7/M11 doesn't change enough to warrant re-export):

1. **M7 description**: "Discovery list with 5 orgs (1 selectable + 4 already-wired)" → "Discovery list with 5 orgs (multi-select via checkboxes; 4 already-wired shown disabled-checked with green WIRED indicator). Selected count drives the gold CTA `+ ADD N INSTALLATIONS`."
2. **M11 description**: "applies on next worker tick (~30s)" → "applies within ~2 seconds (next command tick); skills mid-execution may briefly see undefined env var".

Adds **M12** to spec 0043's artboard list (table row):

| `(new ID)` | M12 · Uninstall App (destructive) | left: 7440 (after M11) | Brecha: App-level uninstall flow. Same destructive pattern as M9/M10. Type-to-confirm = App name in Fraunces italic gold (matches modal title). Warning callout enumerates cascade consequences. Red CTA "UNINSTALL APP". |

The actual M12 artboard creation in Paper happens during 0046 implementation phase (Phase 1.5: revise 0043 + create M12 + re-export PNGs).

## Success Criteria

- All 6 lifecycle modals (M7, M8, M9, M10, M11, M12) implemented per artboards (M12 newly designed in 0046).
- Patches to spec 0043 (M7 multi-select, M11 copy, M12 added).
- Optimistic updates work end-to-end (verified in tests + manual smoke).
- Multi-select with partial failure UX matches LF2 user story.
- Rotate PEM: full validate-all-then-commit cycle implemented.
- Uninstall App: CASCADE works (FK constraints + worker tear-down + navigate away).
- 3 clean reviews.
- Quality gate green.
- Smoke green: each lifecycle flow tested manually on `fn` profile.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Optimistic update + backend rejection causes inconsistent UI flash | TanStack Query handles rollback automatically. Test asserts the rollback path. |
| Multi-select N parallel POSTs hit GitHub rate limit | Spec 0044 already has token cache; mint per-installation reuses cached app JWT (1 sign per parallel call but JWT is reusable for ~10min per the existing fetch loop). For typical N=4-5, no rate concern. Document as a known edge case. |
| `pem-dropzone` accessibility regressions | `react-dropzone` is accessibility-tested upstream. Add manual screen-reader smoke. |
| Type-to-confirm component shared across M9/M10/M12 — bug propagates | Single shared component, single test file. Prefer this over per-modal duplication. |
| User has only 1 installation, removes it, then immediately tries to add new one — race with worker bootstrap state | The `connector_apps` row stays after removing all installations. Worker `GitHubAppAuth` instance persists (just with empty `installations[]`). Adding new installation works immediately. M12 is what fully tears down. |
| Hardcoded `D0EXAMPLE000` (Slack DM channel from spec 0042 smokes) leaks into smoke documentation here | Avoid Slack DM smoke in 0046's success criteria. UI tests cover lifecycle flows entirely without Slack. |

## Open Questions

All resolved by AI per user delegation.

## Coverage gaps (acknowledged)

- **always_sensitive auto-removal on installation remove**: M10 consequence list mentions it, implementation is in spec 0047.
- **Worker hot-reload race after add installation**: documented in 0044; spec 0046 inherits the architecture (mostly invisible to UI).
- **No M-modal for app-level Test All Installations** (the "TEST ALL INSTALLATIONS" button on C8): triggers the existing per-installation test endpoint in parallel. Visual feedback inline in the C8 installations table (per-row spinners → ✓ or ✗ status). No new modal needed.

## Review procedure

3 consecutive review rounds. Same protocol as 0036/0037/0038/0042/0043/0044/0045.

## Implementation order

1. **Phase 0**: Spec docs + 3 reviews (this).
2. **Phase 1**: Patch spec 0043 (1-line revisions to M7/M11 descriptions; M12 added to artboard table). Open Paper, design M12 (clone M10 + relabel), re-export M12 PNG.
3. **Phase 2**: Shared components — `pem-dropzone.tsx`, `type-to-confirm.tsx`. Tests for each.
4. **Phase 3**: Refactor M6 (from 0045) to use the new `pem-dropzone` shared component. M6 was just shipped in 0045 — this is a **breaking refactor of a recently-shipped component**. Acceptance criteria for this phase: (a) the existing M6 install flow tests pass unchanged; (b) screen-reader keyboard-only flow still works; (c) manual smoke against `fn` profile install completes successfully. If any regression detected, abort the refactor and ship M6 + M9 with separate PEM-input components (acceptable code duplication for safety). On abort, skip Phase 3's `pem-dropzone` consolidation and proceed directly to Phase 4 — Phases 4-11 are unaffected.
5. **Phase 4**: TanStack Query hooks (use-discover-installations, use-add-installation with optimistic, etc.). Hook tests.
6. **Phase 5**: M7 + M8 implementation. Modal tests.
7. **Phase 6**: M9 implementation. Modal tests.
8. **Phase 7**: M10 + M11 implementation. Modal tests.
9. **Phase 8**: M12 implementation + uninstall-app endpoint backend test.
10. **Phase 9**: Wire kebab menus + CTAs in C8/C10/C9 to the modals.
11. **Phase 10**: Quality gate green. Manual smoke on `fn` profile (each LF user story).
12. **Phase 11**: `status: shipped`, commit, PR.

## Definition of Done

- All 6 lifecycle modals (M7-M12) live in the dashboard.
- Patches to 0043 applied + 1 new artboard (M12) created in Paper.
- Optimistic updates working end-to-end.
- 3 clean reviews.
- Quality gate green.
- Smoke green: 8 LF user stories all pass on `fn` profile.
- OSS readiness verified: no hardcoded org names, install IDs, or operator-specific values in any UI string. Test fixtures use `Acme Corp`/`12345`.
