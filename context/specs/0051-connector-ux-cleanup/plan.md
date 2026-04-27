---
feature: connector-ux-cleanup
spec: "[[spec]]"
created: 2026-04-27
---
# Connector Ergonomics Cleanup — Plan

**For this spec:** `[[spec]]`

## Approach

Three sequential phases, each ending in a green typecheck. Phase ordering chosen to keep co-located changes coherent and isolate the largest blast radius:

- **Phase A — rotate-PEM removal + dedup uninstall button** (findings #5 + #6). Both touch the AppConfigCard footer of `connectors.github-app.tsx`. Splitting them creates an orphan-button intermediate state. Cross-stack: dashboard, API, worker, storage types.
- **Phase B — operator-picked envVar drop** (finding #7). Largest blast radius (modal, hook, install modals, API schema, R3 F1 validation, reserved key, worker `Installation` interface, `renameInstallation()`, `connector-update` rename branch). Isolated commit for clean revert.
- **Phase C — alert→modal + nav fix on connector detail page** (findings #1 + #2). Pure-frontend polish; introduces one new generic component (`ConfirmModal`).

## Architecture

```
                                      Phase A — rotate-PEM + dedup
                                      ┌───────────────────────────┐
                                      │ dashboard: M9 + footer    │
                                      │ api: rotate-pem route     │
                                      │ worker: rotatePem method  │
                                      │ worker: app_pem_rotated   │
                                      │ storage: pemRotatedAt typ │
                                      └────────────┬──────────────┘
                                                   ▼
                                      Phase B — envVar drop
                                      ┌───────────────────────────┐
                                      │ dashboard: M11, M7 fields │
                                      │ api: schemas, R3 F1, env_var endpoints │
                                      │ worker: Installation, env writes │
                                      │ worker: renameInstallation │
                                      │ worker: __GITHUB_ENV_VAR__ │
                                      └────────────┬──────────────┘
                                                   ▼
                                      Phase C — UI polish
                                      ┌───────────────────────────┐
                                      │ shared: ConfirmModal      │
                                      │ connectors.$id.tsx:       │
                                      │   handleRefresh modal     │
                                      │   handleUninstall modal   │
                                      │   nav fix github-app→     │
                                      │     /connectors/github-app│
                                      └───────────────────────────┘
```

## File Structure

**Deleted:**
- `apps/dashboard/src/components/connectors/lifecycle-modals/github-app-rotate-pem-modal.tsx` (Phase A).
- `apps/dashboard/src/components/connectors/lifecycle-modals/github-app-edit-env-var-modal.tsx` (Phase B).
- `apps/dashboard/src/lib/use-rotate-pem.ts` (Phase A).
- `apps/dashboard/src/lib/use-rename-env-var.ts` (Phase B).
- `apps/worker/src/commands/handlers/app-pem-rotated.ts` (Phase A).
- `apps/worker/tests/commands/app-handlers.test.ts` lines covering app_pem_rotated handler (Phase A).

**Created:**
- `apps/dashboard/src/components/shared/confirm-modal.tsx` (Phase C; ~80 lines; props: `title`, `description`, `confirmLabel?`, `onConfirm`, `requireTypeToConfirm?`).

**Modified:**
- `apps/dashboard/src/routes/_authed/connectors.github-app.tsx` (Phases A + B): drop M9 modal wiring, drop AppConfigCard footer, drop ENV VAR column + EDIT action + M11 modal render.
- `apps/dashboard/src/routes/_authed/connectors.$id.tsx` (Phase C): replace 2 `window.confirm()` calls with ConfirmModal renders; gate uninstall navigation on `connector.appId != null`.
- `apps/dashboard/src/lib/use-app-detail.ts` (Phase A): drop `pemRotatedAt`.
- `apps/dashboard/src/components/connectors/install-modals/github-app-install-modal.tsx` (Phase B): drop envVar field.
- `apps/dashboard/src/components/connectors/lifecycle-modals/github-app-add-installation-modal.tsx` (M7, Phase B): drop envVar column + `defaultEnvVarForName`.
- `apps/dashboard/src/components/connectors/lifecycle-modals/github-app-add-installation-manual-modal.tsx` (M8, Phase B): drop envVar field.
- `apps/api/src/routes/connectors.ts`: drop rotate-pem route + handler enqueue (A); drop addInstallationSchema's envVar, drop the `getInstallationEnvVarsInUse` helper, drop the 409 env_var_in_use response, drop the PATCH envVar translation block (B).
- `apps/api/tests/routes/catalog-github-app.test.ts`: drop rotate-pem tests (A) + drop env_var_in_use tests (B).
- `apps/api/tests/routes/connectors-app-lifecycle.test.ts`: drop M9 lifecycle test (A) + drop the M11 + envVar self-update + uniqueness tests (B).
- `apps/worker/src/github/app-auth.ts` (Phases A + B): drop `rotatePem()` method (A); drop `ENV_VAR` from `GITHUB_APP_RESERVED_KEYS`, drop `envVar` from `Installation` interface, drop `renameInstallation()`, drop `process.env[envVar]` writes from `mintAndCache()`, `addInstallation()`, `removeInstallation()`, `appUninstall()` (B).
- `apps/worker/src/commands/handlers/index.ts` (Phase A): drop `app_pem_rotated` from handler map.
- `apps/worker/src/commands/handlers/connector-create.ts` (Phase B): drop `__GITHUB_ENV_VAR__` lookup.
- `apps/worker/src/commands/handlers/connector-update.ts` (Phase B): drop M11 rename branch.
- `apps/worker/tests/github/app-auth-mutations.test.ts`: drop `rotatePem` describe block (A) + drop `renameInstallation` describe block + envVar assertions in remaining tests (B).
- `apps/worker/src/agent/mcp-build.ts` (Phase B): verify the github-app branch synthesizes `GITHUB_PERSONAL_ACCESS_TOKEN` directly from cached token; remove any reliance on `__GITHUB_ENV_VAR__` reserved key in the secrets-map lookup.
- `packages/storage/src/types.ts`: drop `pemRotatedAt` from `ConnectorApp` + `UpdateConnectorAppInput` (A); drop `'app_pem_rotated'` from `CommandType` (A).
- `packages/storage/src/repos/connector-apps.ts`: drop the `pemRotatedAt` branch in `update()` (A).
- `packages/storage/tests/migrations.test.ts`: column assertion for `pem_rotated_at` keeps (column persists at DB level per Non-Goals).

**Untouched (out of scope):**
- The DB column `connector_apps.pem_rotated_at` (left as legacy).
- Existing `connector_secrets` rows with `__GITHUB_ENV_VAR__` keys (orphaned data, harmless).
- The `commands` table's old `app_pem_rotated` rows (dispatcher logs warning, harmless).
- Paper "Hearty island" artboards.
- Any non-`window.confirm()` UX on the connector detail page.

## Phase Ordering

1. **Phase A (single commit):** rotate-PEM removal + dedup uninstall button. End: green typecheck.
2. **Phase B (single commit):** envVar drop across worker + API + dashboard + storage types. End: green typecheck.
3. **Phase C (single commit):** ConfirmModal + handleRefresh + handleUninstall + nav fix in `connectors.$id.tsx`. End: green typecheck.
4. **Phase D — quality gate** + **Phase E — Docker boot test** + **Phase F — 3-round review** + **Phase G — push + PR.**

## Risks / Open Decisions

| Risk | Decision |
|---|---|
| Removing `process.env[envVar]` writes from `mintAndCache()` breaks any worker code path that reads `process.env` for the github-app token. | Phase B's success-criteria checklist explicitly verifies `mcp-build.ts` synthesizes `GITHUB_PERSONAL_ACCESS_TOKEN` from the cached installation token (no `process.env` reliance). The connectors-e2e P1.x integration tests still pass against the github-app subprocess flow. |
| Dropping `'app_pem_rotated'` from `CommandType` orphans existing rows in the `commands` table. | Accepted: the dispatcher logs a "no handler" warning for unknown command types; old rows are inert. No migration needed. |
| Removing `pemRotatedAt` from `UpdateConnectorAppInput` removes a typed knob on the repo's `update()` method, but the DB column stays. | The column is nullable. Future calls to `update()` simply never set it. Tests that asserted `update({ pemRotatedAt })` are deleted alongside the M9 lifecycle tests. |
| The `ConfirmModal` could be over-extended into a kitchen-sink component over time. | Constitution principle YAGNI applied: keep API to 5 props, no children-as-arbitrary-content escape hatch. JSDoc warns "binary destructive confirmation only". |
