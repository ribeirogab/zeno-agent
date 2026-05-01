---
status: draft
feature: connector-ux-cleanup
created: 2026-04-27
shipped: null
---
# Connector Ergonomics Cleanup — Spec

**Status:** Draft
**Scope:** Last polish round of the connectors-only cleanup arc (PR 3 of 3). Five items: drop the rotate-PEM feature end-to-end, dedup the duplicate uninstall-app button, drop the operator-picked envVar field (M11 + supporting infrastructure), replace `window.confirm()` calls on the connector detail page with a proper modal, and fix the post-uninstall navigation for github-app installations.

## Context

Specs 0049 (docs realignment) and 0050 (skills + Haiku/approval flow removal) already shipped this connector-only repositioning at the doc and runtime level. This spec closes the loop on five operational gaps documented in `tmp/qa-findings-batch-2.md` (gitignored): findings #1, #2, #5, #6, and #7.

The five items are independent in concept but cluster into three natural phases:

- **#5 + #6** — both touch the AppConfigCard footer of the github-app App detail page. Splitting them creates an orphan-button intermediate state. They land together.
- **#7** — drops the operator-picked envVar field across worker, API, dashboard, and storage. Larger blast radius; merits an isolated commit for clean revert.
- **#1 + #2** — two changes in `apps/dashboard/src/routes/_authed/connectors.$id.tsx`: replace `window.confirm()` (uninstall connector + reset tool permissions) with proper modals, and fix the post-uninstall navigation so github-app installations return to `/connectors/github-app`.

After this PR, the connector lifecycle UX is: install via dashboard → use connector tools → uninstall via dashboard. No rotate-PEM flow, no operator-picked env var name (the worker derives the credential delivery internally), no native-browser alerts, and the `/connectors/github-app` page reflects installation removals immediately.

## Problem Statement

Five concrete UX/maintenance gaps remain after PR 2:

1. The rotate-PEM feature is dead weight: it preserves installations + permissions across a PEM swap, but spec 0048 R3 + the connectors-only thesis make uninstall+reinstall the canonical recovery path. Maintaining a separate flow (M9 modal + rotate-pem hook + endpoint + handler + worker method + DB column tracking) costs ongoing maintenance for a rare event.
2. The AppConfigCard footer renders both "ROTATE" (gone after #5) and a duplicate "UNINSTALL APP" button. The page Header already has UNINSTALL APP at the top-right. Two entry points for the same destructive action confuses the operator.
3. The operator-picked envVar (the `__GITHUB_ENV_VAR__` reserved key) was a vestige of the shell-`gh` skill pattern, which spec 0050 retired. The worker authenticates the github-mcp-server subprocess via the fixed `GITHUB_PERSONAL_ACCESS_TOKEN` env var; nothing reads the operator's chosen name anymore. M11 (edit-env-var modal), the rename hook, the install-modal field, the R3 F1 uniqueness validation, the reserved key, and the `renameInstallation()` worker method are all dead code.
4. The connector detail page (`connectors.$id.tsx`) uses `window.confirm()` (browser-native dialog) for uninstall and "reset tool permissions". Native confirm is jarring against the rest of the dashboard's modal-based UX.
5. After uninstalling a github-app installation, `handleUninstall` always navigates to `/connectors`. For github-app installations, the operator's mental model is "I'm managing installations of this App"; landing on the App detail page (`/connectors/github-app`) keeps that context.

## Non-Goals

- **Out of scope: schema cleanup of `connector_apps.pem_rotated_at`.** SQLite `DROP COLUMN` is supported (3.35+, embedded in better-sqlite3) but a table-rebuild would be cosmetic only — the column is nullable, has no remaining writers, and costs nothing at runtime. Drop in a future schema-cleanup migration alongside other dead columns. Risk vs. reward favors leaving it.
- **Out of scope: 410 Gone or 200 noop on the deleted `POST /catalog/github-app/rotate-pem` endpoint.** Zeno is self-hosted single-operator with no external API consumers; the dashboard was the only caller and disappears in this PR. Returning 404 on a vanished endpoint is honest. Endpoint-versioning courtesy is for projects with deployed external clients.
- **Out of scope: schema-level reservation of the legacy `__GITHUB_ENV_VAR__` key.** Existing rows keep the value (harmless data); new installs don't write the key. Future migration may drop legacy keys.
- **Out of scope: any non-`window.confirm()` UX changes on the connector detail page.** Other interactions (toggle enabled/disabled, edit display name, refresh tools, edit secrets) stay as-is.
- **Out of scope: GitHub App rotation via the GitHub web UI.** The operator can still rotate the PEM on github.com manually and reinstall in Zeno. Out of Zeno's UX scope after this PR.
- **Out of scope: Paper artboard updates** for the AppConfigCard footer (rotate button removal). Visual artifacts that mention removed UI become a follow-up Paper sync; the code is the source of truth.

## Constraints

- **Compile must stay green at every phase commit.** Phase ordering (Q5 decision): #5+#6 together → #7 → #1+#2. Each commit ends in green typecheck.
- **Quality gate must pass.** `pnpm run quality-gate` (lint + typecheck + tests across 8 workspaces) green by end of the PR. Tests for deleted modules are deleted; tests for kept modules with reduced surface area get adjusted.
- **Docker boot must remain clean.** `pnpm run docker:build && PROFILE=fn pnpm run docker:up` produces the same `connector_gate_enabled` + `mcp_loaded` + `zeno_online` log sequence after the changes.
- **Spec 0050 contract preserved.** The single connector-permission gate stays the only guardrail; nothing in this spec re-introduces a policy chain.
- **Modal pattern: ONE generic `ConfirmModal` component** parameterized by a `requireTypeToConfirm` prop. Uninstall uses it WITH type-to-confirm (irreversible action — the connector's secrets, tool permissions, and DB row vanish on confirm). Reset tool permissions uses it WITHOUT type-to-confirm (reversible — defaults can be re-applied via refresh-tools or by editing the toggle individually).
- **Constitution principles:** Reversibility first (each commit revertible), One decision at a time (this is the implementation only — the architecture is in 0049), YAGNI (no premature abstractions or speculative state).

## User Stories / Scenarios

1. **A maintainer pulls this branch + reboots Docker.** Logs to `zeno_online` are unchanged from PR 2. The dashboard `/connectors/github-app` page no longer renders a "ROTATE" button or the duplicate inline "uninstall app" button below it; the AppConfigCard's footer collapses to just the "never rotated" text being gone with the rest.

2. **The operator opens the M7 (add-installation) or M8 (add-installation-manual) modal.** No envVar input field appears. The modal is shorter; the operator picks an installation from the discovery list (M7) or types the installation ID + display name (M8) and confirms. The created connector's `connector_secrets` rows do NOT include `__GITHUB_ENV_VAR__`.

3. **The operator opens an existing installation row in the App detail page.** No "EDIT" button next to the env var (M11 is gone). The "ENV VAR" column itself is gone — the table shows just `INSTALLATION | TOOLS | LAST VERIFIED | ACTIONS`.

4. **The operator clicks "uninstall" on a github-app installation row.** A type-to-confirm modal appears (consistent with M10 from spec 0046). They type the installation name; confirm; the row disappears; **they remain on `/connectors/github-app`** (no longer kicked to `/connectors`). The remaining installations list refreshes immediately.

5. **The operator clicks "uninstall" on a non-app connector** (Linear, Sentry, etc.) from `/connectors/<id>`. A type-to-confirm modal appears (the same generic `ConfirmModal` component, with `requireTypeToConfirm`). They type the connector display name; confirm; the connector + secrets + tools disappear; navigation lands on `/connectors`.

6. **The operator clicks "reset tool permissions" on any connector.** A simple confirm modal (no type-to-confirm) explains the action; OK applies; Cancel aborts. Native `window.confirm()` is gone.

7. **A future contributor reads spec 0046's M9 (rotate PEM) section.** Spec 0046 stays factually correct as a historical record (M9 was shipped, then removed). No change to its content. Spec 0051 is the explicit follow-up that retires the feature; future readers cross-reference.

## Success Criteria

**Phase mapping:** Phase A = findings #5 (rotate-PEM removal) + #6 (dedup uninstall button); Phase B = finding #7 (envVar drop); Phase C = findings #1 (alert→modal) + #2 (nav fix on uninstall).

- [ ] **Phase A (combined): rotate-PEM feature gone, duplicate uninstall button gone.**
  - `apps/dashboard/src/components/connectors/lifecycle-modals/github-app-rotate-pem-modal.tsx` deleted.
  - `apps/dashboard/src/lib/use-rotate-pem.ts` deleted.
  - `apps/dashboard/src/routes/_authed/connectors.github-app.tsx` — drop the rotate-pem modal import + state + render; drop the AppConfigCard footer entirely (rotate button + "rotated <ts>" / "never rotated" line + duplicate uninstall-app button); the App's `pemRotatedAt` field is no longer read from `useAppDetail`'s response.
  - `apps/dashboard/src/lib/use-app-detail.ts` — drop `pemRotatedAt` from the `AppDetail.app` interface (the API still returns it; the field is just not consumed in the dashboard).
  - `apps/api/src/routes/connectors.ts` — drop the `POST /catalog/github-app/rotate-pem` route + `rotatePemSchema` + the corresponding `app_pem_rotated` enqueue.
  - `apps/worker/src/commands/handlers/app-pem-rotated.ts` deleted.
  - `apps/worker/src/commands/handlers/index.ts` drops `app_pem_rotated` from the handler map; the `CommandType` union (in `packages/storage/src/types.ts`) loses `'app_pem_rotated'`.
  - `apps/worker/src/github/app-auth.ts` `rotatePem()` method deleted.
  - **Storage layer cleanup (per QA finding #5):**
    - `packages/storage/src/types.ts` — drop `pemRotatedAt: string | null` from the `ConnectorApp` interface; drop `pemRotatedAt?: string | null` from `UpdateConnectorAppInput`.
    - `packages/storage/src/repos/connector-apps.ts` — drop the `pemRotatedAt` branch in `update()` (the column write is dead post-Phase-A).
    - **The DB column `connector_apps.pem_rotated_at` REMAINS** (legacy; out of scope per Non-Goals — SQLite table-rebuild for cosmetic cleanup is out-of-balance with risk). Existing rows just stop being read or written; the column is nullable and inert.
    - Tests touching `pemRotatedAt` (e.g. in `packages/storage/tests/migrations.test.ts` line ~294 — the `connector_apps` columns assertion includes `pem_rotated_at`) keep the column assertion (it still exists at the DB level) but drop any tests that exercise the typed field.
  - All related tests deleted (frontend M9 + worker app-pem-rotated handler test + API rotate-pem route test).
- [ ] **Phase B (envVar drop):**
  - `apps/dashboard/src/components/connectors/lifecycle-modals/github-app-edit-env-var-modal.tsx` (M11) deleted.
  - `apps/dashboard/src/lib/use-rename-env-var.ts` deleted.
  - `apps/dashboard/src/components/connectors/install-modals/github-app-install-modal.tsx` (or wherever the M7 envVar field lives) — drop the envVar input.
  - `apps/dashboard/src/components/connectors/lifecycle-modals/github-app-add-installation-modal.tsx` (M7) — drop the envVar column from the multi-select discovery table; drop `defaultEnvVarForName`.
  - `apps/dashboard/src/components/connectors/lifecycle-modals/github-app-add-installation-manual-modal.tsx` (M8) — drop the envVar field.
  - `apps/dashboard/src/routes/_authed/connectors.github-app.tsx` — drop the "ENV VAR" column from the installations table, drop the "EDIT" action that opens M11, drop the M11 modal render.
  - `apps/api/src/routes/connectors.ts`:
    - `addInstallationSchema` drops the `envVar` field.
    - The connector_create payload drops the `__GITHUB_ENV_VAR__` secret.
    - `getInstallationEnvVarsInUse` helper deleted (R3 F1 uniqueness validation goes with the field).
    - The 409 `env_var_in_use` response shape disappears (no longer reachable).
    - The PATCH `envVar` translation block (M11 backend) deleted.
    - `patchSchema` drops the `envVar` field.
  - `apps/worker/src/github/app-auth.ts`:
    - `GITHUB_APP_RESERVED_KEYS.ENV_VAR` constant removed (only `INSTALLATION_ID` and `INSTALLATION_NAME` remain).
    - `Installation` interface: `envVar` field removed.
    - `addInstallation()` argument shape adapts (no longer takes envVar).
    - `removeInstallation()` no longer deletes `process.env[envVar]` (it never gets set anymore).
    - `renameInstallation()` method deleted entirely.
    - `mintAndCache()` no longer writes `process.env[installation.envVar] = token`. The MCP subprocess gets `GITHUB_PERSONAL_ACCESS_TOKEN` directly via `apps/worker/src/agent/mcp-build.ts` (already the case post-spec-0044; the `process.env[envVar]` write was the vestigial path).
    - `appUninstall()` no longer iterates installations to delete env vars.
  - `apps/worker/src/commands/handlers/connector-create.ts` — drop the `__GITHUB_ENV_VAR__` lookup and the `envVar` argument to `addInstallation()`.
  - `apps/worker/src/commands/handlers/connector-update.ts` — drop the M11 rename branch (oldName/newEnvVar handling).
  - All related tests deleted or adjusted.
  - `apps/worker/src/agent/mcp-build.ts` — verify the github-app branch still synthesizes the `GITHUB_PERSONAL_ACCESS_TOKEN` secret correctly (it does; the reserved-keys lookup just stops looking for `__GITHUB_ENV_VAR__`).
  - `loadGitHubAppFromDb` (in `app-auth.ts`) — drops the per-installation envVar loading.
- [ ] **Phase C (#1 + #2): UI polish on connector detail page.**
  - New `apps/dashboard/src/components/shared/confirm-modal.tsx` — generic confirm component with `title: string`, `description: ReactNode`, `confirmLabel?: string`, `onConfirm: () => void`, and **optional `requireTypeToConfirm: string`** prop (when set, renders a type-to-confirm input that gates the confirm button — pattern identical to M10's italic-gold name field).
  - `apps/dashboard/src/routes/_authed/connectors.$id.tsx`:
    - `handleRefresh` (line ~89) — replace `window.confirm(...)` with a state-driven `<ConfirmModal>` (without type-to-confirm). The modal explains "this resets all tool permissions to defaults" with OK/Cancel.
    - `handleUninstall` (line ~96) — replace `window.confirm(...)` with `<ConfirmModal requireTypeToConfirm={connector.displayName}>`. After successful uninstall:
      - If `connector.slug.startsWith('github-app-')` (or equivalently, `connector.appId != null`) → `navigate({ to: '/connectors/github-app' })`.
      - Otherwise → `navigate({ to: '/connectors' })`.
- [ ] **Quality gate green** across all 8 workspaces.
- [ ] **Docker boot** (fn profile) clean — `connector_gate_enabled`, `mcp_loaded` count=4 (chatdesk-brasil installation), no errors.
- [ ] **Net diff** is reduction-heavy: ~600+ lines removed across worker (~150), dashboard (~250), api (~150), tests (~100). Net additions limited to the new `confirm-modal.tsx` (~80 lines) and the spec/plan/tasks docs.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| The `process.env[installation.envVar]` write was supposedly vestigial post-spec-0050 — but if any production code path still reads it, removing it breaks runtime behavior. | Phase B's success criterion explicitly verifies `mcp-build.ts` synthesizes `GITHUB_PERSONAL_ACCESS_TOKEN` directly from the cached installation token (no reliance on `process.env`). The M11 lifecycle test that exercised the rename will be deleted, but the integration test exercising github-app installation tool calls (P1.x in connectors-e2e) stays and will verify end-to-end token delivery. |
| Existing `connector_secrets` rows for github-app installations include `__GITHUB_ENV_VAR__`. After this PR they're orphaned data. | Acceptable. The reserved-keys list in `app-auth.ts` no longer includes the value, so it's never read. A future schema cleanup migration may delete legacy rows. |
| The `app_pem_rotated` command type is removed from the `CommandType` union; existing `commands` table rows of that type become orphaned. | The `commands` table is append-only and old rows are ignored by the dispatcher (which throws "no handler for command type"). Migration not required; `pnpm run docker:up` against an existing DB just won't process any pending `app_pem_rotated` rows. The dispatcher's "no handler" branch logs a warning, which is the right signal. |
| The connector detail page's uninstall modal needs to know if the connector is a github-app installation, but `connector.appId` is fetched server-side. | The detail-page query (`useConnector`) already returns `appId` in the response. Use that for the navigation branching. No new endpoint needed. |
| Removing the "ENV VAR" column from the installations table changes the visual width balance. | Acceptable. The remaining columns (INSTALLATION | TOOLS | LAST VERIFIED | ACTIONS) re-flow naturally. A Paper artboard sync is out of scope per Non-Goals. |
| The new generic `ConfirmModal` could grow into a kitchen-sink component over time. | Mitigation: keep the API minimal (title, description, optional `requireTypeToConfirm: string`). Document in a JSDoc that it's for binary destructive confirmation only; complex flows should not extend it. |

## Open Questions

None at this time. Five brainstorming questions resolved with the multi-perspective protocol; final calls recorded in plan.md.
