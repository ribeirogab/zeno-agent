---
feature: connector-ux-cleanup
plan: "[[plan-connector-ux-cleanup]]"
spec: "[[spec-connector-ux-cleanup]]"
created: 2026-04-27
---
# Connector Ergonomics Cleanup — Tasks

**For this plan:** `[[plan-connector-ux-cleanup]]`

## Phase A: rotate-PEM removal + dedup uninstall button

### Task A.1: Frontend cleanup
- [ ] Delete `apps/dashboard/src/components/connectors/lifecycle-modals/github-app-rotate-pem-modal.tsx`.
- [ ] Delete `apps/dashboard/src/lib/use-rotate-pem.ts`.
- [ ] Edit `apps/dashboard/src/routes/_authed/connectors.github-app.tsx`:
  - Drop M9 imports.
  - Drop `kind: 'rotate-pem'` from the modal state union.
  - Drop the M9 modal render branch.
  - Drop the AppConfigCard footer prop drilling (`onRotatePem`, `onUninstall` for the inline button, `rotatedAt`).
  - In `AppConfigCard` itself: drop the entire footer (rotate button + "rotated <ts>" / "never rotated" line + duplicate inline uninstall-app link).
- [ ] Edit `apps/dashboard/src/lib/use-app-detail.ts`: drop `pemRotatedAt: string | null` from `AppDetail.app`.

### Task A.2: API cleanup
- [ ] Edit `apps/api/src/routes/connectors.ts`:
  - Drop the `POST /catalog/github-app/rotate-pem` route registration + body.
  - Drop the `rotatePemSchema` zod schema.
  - Drop any `app_pem_rotated` enqueue side-effect.
- [ ] Edit `apps/api/tests/routes/catalog-github-app.test.ts`: delete the rotate-pem describe block.
- [ ] Edit `apps/api/tests/routes/connectors-app-lifecycle.test.ts`: delete the M9 (rotate-pem) describe block.

### Task A.3: Worker cleanup
- [ ] Delete `apps/worker/src/commands/handlers/app-pem-rotated.ts`.
- [ ] Edit `apps/worker/src/commands/handlers/index.ts`: drop the `app_pem_rotated` import + handler-map entry.
- [ ] Edit `apps/worker/src/github/app-auth.ts`: delete `rotatePem()` method.
- [ ] Edit `apps/worker/tests/github/app-auth-mutations.test.ts`: delete the `rotatePem` describe block.
- [ ] Edit `apps/worker/tests/commands/app-handlers.test.ts`: delete the `app_pem_rotated handler` describe block.

### Task A.4: Storage cleanup
- [ ] Edit `packages/storage/src/types.ts`:
  - Drop `pemRotatedAt: string | null` from the `ConnectorApp` interface.
  - Drop `pemRotatedAt?: string | null` from `UpdateConnectorAppInput`.
  - Drop `'app_pem_rotated'` from the `CommandType` union.
- [ ] Edit `packages/storage/src/repos/connector-apps.ts`:
  - Drop the `pemRotatedAt` branch in `update()`.
  - Drop any other `pemRotatedAt` setter helpers.
- [ ] Verify `packages/storage/tests/migrations.test.ts` line ~294 column-assertion for `pem_rotated_at` STAYS (the DB column persists per Non-Goals).
- [ ] Verify `packages/storage/tests/connector-apps.test.ts` (or wherever the repo is tested): drop tests that pass `pemRotatedAt`.

### Task A.5: Verify + commit
- [ ] `pnpm --filter @zeno/storage run typecheck`
- [ ] `pnpm --filter @zeno/api run typecheck`
- [ ] `pnpm --filter @zeno/worker run typecheck`
- [ ] `pnpm --filter @zeno/dashboard run typecheck`
- [ ] `pnpm --filter @zeno/storage run test && pnpm --filter @zeno/api run test && pnpm --filter @zeno/worker run test && pnpm --filter @zeno/dashboard run test`
- [ ] Commit: `refactor: remove rotate-PEM feature + dedup uninstall-app button (spec 0051 phase A)`

## Phase B: envVar drop

### Task B.1: Frontend cleanup
- [ ] Delete `apps/dashboard/src/components/connectors/lifecycle-modals/github-app-edit-env-var-modal.tsx`.
- [ ] Delete `apps/dashboard/src/lib/use-rename-env-var.ts`.
- [ ] Edit `apps/dashboard/src/components/connectors/install-modals/github-app-install-modal.tsx`: drop the envVar input field + the `defaultEnvVarForName` helper if it lives here.
- [ ] Edit `apps/dashboard/src/components/connectors/lifecycle-modals/github-app-add-installation-modal.tsx` (M7): drop the envVar column from the multi-select discovery table; drop `defaultEnvVarForName` if it lives here.
- [ ] Edit `apps/dashboard/src/components/connectors/lifecycle-modals/github-app-add-installation-manual-modal.tsx` (M8): drop the envVar field.
- [ ] Edit `apps/dashboard/src/routes/_authed/connectors.github-app.tsx`:
  - Drop the "ENV VAR" column from the installations table.
  - Drop the EDIT action that opens M11.
  - Drop the M11 modal import + render + state branch.

### Task B.2: API cleanup
- [ ] Edit `apps/api/src/routes/connectors.ts`:
  - `addInstallationSchema`: drop the `envVar` field.
  - The connector_create payload assembly: drop the `__GITHUB_ENV_VAR__` secret line.
  - Delete `getInstallationEnvVarsInUse` helper.
  - Delete the install endpoint's 409 `env_var_in_use` block.
  - Delete the PATCH `/:id` envVar translation block (lines around 1054-1100).
  - `patchSchema`: drop the `envVar` field.
- [ ] Edit `apps/api/tests/routes/catalog-github-app.test.ts`: delete the `env_var_in_use` collision test.
- [ ] Edit `apps/api/tests/routes/connectors-app-lifecycle.test.ts`: delete the M11 lifecycle tests + the envVar self-update test + the uniqueness collision test.

### Task B.3: Worker cleanup
- [ ] Edit `apps/worker/src/github/app-auth.ts`:
  - Drop `ENV_VAR` from `GITHUB_APP_RESERVED_KEYS`.
  - Drop `envVar: string` from `Installation` interface.
  - Drop the `delete process.env[inst.envVar]` lines from `removeInstallation()` and `appUninstall()`.
  - Drop the `process.env[installation.envVar] = minted.token` line from `mintAndCache()`.
  - Drop `process.env[installation.envVar] = ...` from `addInstallation()` if present.
  - Drop `process.env.GH_TOKEN = primaryToken;` from `refreshAll()` if present (this was for shell-skill compat; not needed anymore — the github-mcp-server subprocess gets `GITHUB_PERSONAL_ACCESS_TOKEN` directly from `mcp-build.ts`).
  - Delete `renameInstallation()` method entirely.
  - `addInstallation()` argument type: change from `Installation` to `Omit<Installation, 'envVar'>` or just `{ name: string; id: string }`.
- [ ] Edit `apps/worker/src/commands/handlers/connector-create.ts`: drop the `envVar` lookup from the secrets map; pass `{ name, id }` (no envVar) to `addInstallation()`.
- [ ] Edit `apps/worker/src/commands/handlers/connector-update.ts`: delete the M11 rename branch entirely (the `oldName/oldEnvVar/newName/newEnvVar` block).
- [ ] Edit `apps/worker/src/agent/mcp-build.ts`: verify the github-app branch already constructs `effectiveSecrets = [{ key: 'GITHUB_PERSONAL_ACCESS_TOKEN', value: token }]` directly from `githubApp.getCachedToken()`. No code change needed here — but **verify the synthesis path doesn't reference `__GITHUB_ENV_VAR__` from the secrets map.**
- [ ] Edit `apps/worker/src/github/app-auth.ts` `loadGitHubAppFromDb`: drop the per-installation envVar loading from connector secrets.
- [ ] Edit `apps/worker/tests/github/app-auth-mutations.test.ts`:
  - Delete the `renameInstallation` describe block.
  - Update remaining tests to drop `envVar:` from Installation construction.
  - Drop assertions on `process.env.GITHUB_TOKEN_*` (no longer set).

### Task B.4: Verify + commit
- [ ] All workspace typechecks green.
- [ ] All workspace tests green.
- [ ] Commit: `refactor: drop operator-picked envVar field (spec 0051 phase B)`

## Phase C: ConfirmModal + UI polish on connector detail page

### Task C.1: Build the generic ConfirmModal
- [ ] Create `apps/dashboard/src/components/shared/confirm-modal.tsx`. Props:
  ```ts
  interface ConfirmModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description: ReactNode;
    confirmLabel?: string;       // defaults to 'Confirm'
    onConfirm: () => void | Promise<void>;
    /** When set, renders a type-to-confirm input that gates the confirm button. */
    requireTypeToConfirm?: string;
    /** Visual treatment: 'destructive' | 'neutral'. Defaults to 'destructive'. */
    intent?: 'destructive' | 'neutral';
  }
  ```
- [ ] JSDoc on the component:
  > "Binary destructive confirmation only. Do not extend with arbitrary content slots — if you need richer dialog content, build a purpose-specific modal."
- [ ] Style consistent with M10 (italic-gold name when type-to-confirm is on).
- [ ] Add a unit test under `apps/dashboard/tests/components/shared/confirm-modal.test.tsx` covering: simple confirm flow, type-to-confirm gates the confirm button, cancel.

### Task C.2: Wire into connector detail page
- [ ] Edit `apps/dashboard/src/routes/_authed/connectors.$id.tsx`:
  - Add state for two modals: `resetOpen` and `uninstallOpen`.
  - Replace `handleRefresh`'s `window.confirm()` with a `<ConfirmModal>` (no type-to-confirm; intent `destructive`).
  - Replace `handleUninstall`'s `window.confirm()` with a `<ConfirmModal requireTypeToConfirm={c.displayName}>`.
  - In the uninstall's `onSuccess`, branch the navigate target:
    ```ts
    if (c.appId != null) {
      navigate({ to: '/connectors/github-app' });
    } else {
      navigate({ to: '/connectors' });
    }
    ```
- [ ] Optional: add a test at `apps/dashboard/tests/routes/connectors-detail.test.tsx` covering the navigate branching for github-app vs non-app connectors.

### Task C.3: Verify + commit
- [ ] All workspace typechecks green.
- [ ] All workspace tests green.
- [ ] Commit: `feat(dashboard): replace window.confirm with ConfirmModal + fix github-app uninstall nav (spec 0051 phase C)`

## Phase D: Quality gate
- [ ] `pnpm run quality-gate` — 30/30 turbo tasks green.

## Phase E: Docker boot test
- [ ] `PROFILE=<your-profile> pnpm run docker:down && pnpm run docker:build && PROFILE=<your-profile> pnpm run docker:up`
- [ ] `docker logs zeno-<your-profile>-agent-1` shows `migrations_applied`, `github_app_token_initialized`, `mcp_loaded` count=4, `connector_gate_enabled`, no errors.
- [ ] Dashboard renders at http://localhost:3001 — settings page no longer has sensitive-tools section, App detail page no longer has rotate button or env var column.

## Phase F: Three-round review

### F.1: Round 1 (self)
- [ ] Read `git diff main..HEAD --stat`. Spot-check each modified file: any leftover rotate-PEM, M11, envVar, or window.confirm reference?
- [ ] Any finding → fix → reset to round 1.

### F.2: Round 2 (self, fresh eyes)
- [ ] Same as round 1, fresh pass.

### F.3: Round 3 (independent subagent)
- [ ] Dispatch Explore subagent: prompt it to review `git diff chore/strip-skills-and-classifier..HEAD` for surviving references to: `rotatePem`, `app_pem_rotated`, `pem_rotated_at` field reads, `__GITHUB_ENV_VAR__`, `renameInstallation`, `getInstallationEnvVarsInUse`, `env_var_in_use`, M11 / M9, `window.confirm`, navigation gaps for github-app uninstall.
- [ ] Any finding → fix → reset to round 1.

## Phase G: Push + open PR
- [ ] `git push -u origin chore/connector-ux-cleanup`
- [ ] `gh pr create --base chore/strip-skills-and-classifier --head chore/connector-ux-cleanup --title "..." --body "..."`
- [ ] Output PR URL.
