---
feature: connector-linear
plan: "[[plan-connector-linear]]"
spec: "[[spec-connector-linear]]"
created: 2026-04-26
---
# Linear Connector — Tasks

**For this plan:** `[[plan-connector-linear]]`

## Phase 0 — Spec finalization (3-review loop)

### Task 0.1: Author docs

- [x] Step 1: spec.md
- [x] Step 2: plan.md
- [x] Step 3: tasks.md

### Task 0.2: Review R1 (independent)

- [x] spec-document-reviewer cold; restart on findings. Cleared on round 3.

### Task 0.3: Review R2 (cross-check vs codebase)

- [x] Re-read `apps/api/src/lib/catalog-loader.ts`, `packages/mcp-discover/src/{discover,build-config}.ts`, `apps/api/src/routes/connectors.ts` (catalog test endpoint), the Sentry catalog entry as a stdio reference.
- [x] Verify every claim about the remote-transport code path matches reality. Cleared.

### Task 0.4: Review R3 (fresh independent)

- [x] Cleared on round 3.

### Task 0.5: Approve

- [x] `status: approved` front-matter.

## Phase 1 — Catalog entry

### Task 1.1: Append `linear` to `agent/connectors-catalog.json`

- [ ] Insert a new `connectors[]` entry. Today the array has only Sentry, so put Linear FIRST (alphabetical: `linear` < `sentry`). The catalog is sorted alphabetically by `id` going forward.
- [ ] Fields:
  - `id: "linear"`
  - `name: "Linear"`
  - `description: "Issues, projects, cycles, docs, and team metadata."`
  - `icon: "linear.svg"`
  - `docsUrl: "https://linear.app/docs/mcp"`
  - `transport: "remote"`
  - `transportConfig: { "url": "https://mcp.linear.app/mcp" }`
  - `authCheckTool: "list_teams"`
  - `secrets: [{ key: "__MCP_AUTHORIZATION__", label: "Authorization Header", help: "Linear API key as a Bearer token. Format: \"Bearer lin_api_xxxxx\". Get a personal API key at linear.app/settings/api.", required: true }]`
  - `tools: []` (filled by Phase 2)
  - `tags: ["issues", "project-management"]`

### Task 1.2: Validate JSON

- [ ] `python3 -m json.tool agent/connectors-catalog.json > /dev/null` — clean.

## Phase 2 — Tool list regeneration

### Task 2.0: Patch regenerator (skip-on-missing-env)

- [ ] Edit `apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs`. In `fetchToolsFromLiveMcp`, replace the `if (!value) { throw ... }` block (around lines 90–94) with:
  ```js
  if (!value) {
    console.warn(
      `skip ${entry.id}: missing env var ${envName} (set it to fetch tools for this entry)`,
    );
    continue;
  }
  ```
- [ ] Why: the script throws on the first catalog entry whose env var isn't set. Today (with Sentry as the only entry) that's fine; from this spec onward we add connectors one at a time and don't always have every other connector's token in scope. Skip-with-warning preserves the skipped entry's existing `tools[]` (we only overwrite `entry.tools` after a successful fetch).
- [ ] Sanity-check: run the script with NO env vars at all → expect 1 warning per catalog entry that HAS a required secret (entries with no required secret hit the existing `console.error` + `continue` branch, which is unrelated). No fetch attempts; snapshot regen still succeeds because writeSnapshot mirrors the in-memory catalog (which was unchanged).

### Task 2.1: Run regenerator with live key

- [ ] `__MCP_AUTHORIZATION__="Bearer lin_api_xxx" node apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs --fetch-from-mcp`
- [ ] **Why `__MCP_AUTHORIZATION__` as the env var name**: the regenerator derives the env var name from the catalog entry's first required secret key (script line 88: `const envName = required.key`). Linear's required secret has `key: '__MCP_AUTHORIZATION__'`, so the env var the script reads is named `__MCP_AUTHORIZATION__`. The script then constructs `secrets = [{ key: '__MCP_AUTHORIZATION__', value }]` and passes it to `discoverTools`, which dispatches to `toRemoteConfig` (transport='remote'); that function intercepts the reserved key and places the value in `headers.Authorization`. Net effect: the value you set in env reaches Linear's MCP as the `Authorization` header.
- [ ] **Caveat**: regen does NOT call the `authCheckTool` (`list_teams`) — only `tools/list`. That means a malformed/unauthorized token may pass regen silently. Real credential validation comes in Task 5.2 via `POST /catalog/linear/test`.
- [ ] Sentry should log `skip sentry: missing env var SENTRY_ACCESS_TOKEN` (warning, not error). Linear should log `fetching tools from live MCP for linear...` and `linear: <N> tools updated`.
- [ ] Inspect the diff in `agent/connectors-catalog.json` — only the Linear `tools[]` changes (from `[]` to 30+); Sentry's `tools[]` is untouched.
- [ ] Inspect the diff in `apps/worker/tests/connectors-e2e/__snapshots__/catalog-tools.snap` — Linear key added; Sentry key unchanged.

### Task 2.2: Confirm category distribution

- [ ] Read the regenerated `tools[]`. Spot-check: `list_*` / `get_*` are `read`, `create_*` / `delete_*` are `write`, `save_*` are `interactive` (because `save_` isn't a recognized prefix). All categories' default permissions correct (read=`always_allow`, write=`ask`, interactive=`ask`).

## Phase 3 — Brand icon

### Task 3.1: Download Linear's icon

- [ ] `curl -L -o agent/assets/connectors/linear.svg https://static.linear.app/integrations/mcp/icon.svg`
- [ ] Verify size reasonable (<10KB). Open file to sanity-check it's a valid SVG.

### Task 3.2: Catalog references the icon by filename only

- [ ] No path/URL changes — `icon: "linear.svg"` is enough; the API endpoint at `connectors.ts:204` resolves the path from `agent/assets/connectors/`.

## Phase 4 — Quality gate

### Task 4.1: Run

- [ ] `pnpm -w run quality-gate` → 26/26 tasks green; spec 0037 P1.5 (catalog snapshot self-consistency) still passes.

## Phase 5 — Manual smoke (live profile)

### Task 5.1: Deploy

- [ ] `pnpm run docker:build` (incremental — catalog change picks up via the agent/ bind mount, but container restart picks up the new icon SVG too)
- [ ] `PROFILE=fn pnpm run docker:up` (recreate)
- [ ] Wait for API health: poll `/api/auth/me` until 401.

### Task 5.2: API smoke

- [ ] Login + capture cookies.
- [ ] `POST /api/connectors/catalog/linear/test` with bad token → expect `{ok: false, errorKind: 'auth'}`.
- [ ] Same with real token → expect `{ok: true, tools: [<30+>]}`.

### Task 5.3: UI smoke

- [ ] Open `http://localhost:3001/connectors` → Linear card renders with brand icon.
- [ ] Click → install modal opens.
- [ ] Paste `Bearer <real key>` → click Test → ✓ strip with tool count.
- [ ] Click Add → modal closes, Linear appears in installed section as `enabled`. (Install enqueues a `connector_create` command; the worker handler creates the row asynchronously, so wait briefly for the row to appear in the installed section.)
- [ ] Click the Linear card in the installed section → navigates to the detail page (URL pattern `/connectors/<DB-uuid>` — UUID is hidden from the user but visible in the URL bar). Detail page lists 30+ tools across read/write/interactive panels with default permissions.

### Task 5.4: Runtime smoke (Slack)

- [ ] Send DM to `D0EXAMPLE000`: `[smoke linear] me lista 3 issues abertas no meu time da Flávia Nasser`.
- [ ] Wait up to 90s for agent reply.
- [ ] Verify reply contains 3+ Linear issue references with structured data (titles, status, etc.).
- [ ] Verify DB: `connector_invocations` has at least one row with `tool_name='list_issues'` (or similar) and `result='ok'`.

### Task 5.5: Persist results

- [ ] `tmp/0039-validation/` with the artifacts: API smoke output, screenshot of UI install, Slack reply, DB query result.

## Phase 6 — Close

### Task 6.1: Spec status

- [ ] `spec.md` front-matter `status: shipped`, `shipped: <date>`.

### Task 6.2: Optional learning note

- [ ] If anything non-obvious surfaced (Bearer prefix UX gotcha; SVG rendering issue; tool category that didn't classify as expected) → write a short note under `context/learnings/`.

### Task 6.3: Commit on a feature branch + open PR (with explicit user authorization)

- [ ] Create a feature branch (e.g., `feat/connector-linear`) and commit with a detailed message there. Do NOT commit directly on main — per global CLAUDE.md, deploys/automations trigger on main and a separate PR is the safe path.
- [ ] Wait for explicit user authorization to push the branch.
- [ ] Open a PR using `/open-pr` (project-required command) — auto-generates title + description.
- [ ] Wait for explicit user authorization before merging into main.

## Definition of Done

- Spec: 3 clean reviews → status `shipped`.
- Catalog entry committed with full tools[] and snapshot regenerated.
- Linear icon committed.
- Quality gate green.
- Manual smoke green: API + UI + Slack.
