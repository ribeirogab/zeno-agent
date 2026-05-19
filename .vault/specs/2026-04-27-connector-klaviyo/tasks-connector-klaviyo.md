---
feature: connector-klaviyo
plan: "[[plan-connector-klaviyo]]"
spec: "[[spec-connector-klaviyo]]"
created: 2026-04-27
---
# Klaviyo Connector — Tasks

**For this plan:** `[[plan-connector-klaviyo]]`

## Phase 0 — Spec finalization (3-review)

- [x] Author docs.
- [x] R1 / R2 (cross-check) / R3. Cleared after multiple rounds.
- [x] Front-matter `status: approved`.

## Phase 1 — Dockerfile + 0039 prereq gate

> **GATE: This phase and all later phases (3–7) are BLOCKED until spec 0039 has merged the regenerator patch (throw → warn+continue on missing env). Run Task 1.0 first; if it fails, do not proceed.**

### Task 1.0: Verify spec 0039's regenerator patch is present

- [ ] `grep -n "skip.*: missing env var" apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs` should match a line containing `console.warn(...)` (the patched form).
- [ ] If grep returns nothing, the script is still on the `throw new Error(...)` form — STOP and merge spec 0039 first. Phase 3 will abort on the first non-Klaviyo entry with a missing token without the patch.

### Task 1.1: Add `uv` install (in `base` stage)

- [ ] Edit `infra/Dockerfile` `base` stage (NOT runtime — runtime inherits from base, and runtime switches to `USER node` before `CMD`, so a root-required `RUN` would fail there). Insert the line **after the AWS CLI install block and before `corepack enable`** (around current line 22):
  ```dockerfile
  # Spec 0040: install `uv` for Python-based MCP servers (Klaviyo, Swarmia).
  RUN curl -LsSf https://astral.sh/uv/0.11.7/install.sh | UV_INSTALL_DIR=/usr/local/bin sh
  ```
- [ ] Inlining `UV_INSTALL_DIR=/usr/local/bin` keeps the env var scoped to the install step. The version `0.11.7` is verified against Astral's GitHub releases as of 2026-04-27.

### Task 1.2: Verify build (root + node user contexts)

- [ ] `pnpm run docker:build` clean.
- [ ] `docker run --rm zeno-agent:dev uvx --version` prints a `0.11.x` version (root context).
- [ ] `docker run --rm --user node zeno-agent:dev uvx --version` prints the same version (node user context — matches the runtime container's user). The `/usr/local/bin` path is on the default `PATH` for both users, so this should work.

## Phase 2 — Catalog entry

### Task 2.1: Append `klaviyo` to `agent/connectors-catalog.json`

- [ ] Order: alphabetical (`klaviyo` between `linear` and `sentry`).
- [ ] Fields per plan §Phase 2.
- [ ] `tools: []` initially.

### Task 2.2: Validate JSON

- [ ] `python3 -m json.tool agent/connectors-catalog.json > /dev/null`.

## Phase 3 — Tool list regeneration

> **Execution context**: Phase 3 runs **on the host**, not inside the container. Reasons:
> - `agent/connectors-catalog.json` is bind-mounted into the container as **read-only** (`infra/docker-compose.<profile>.yml` line 16: `./agent:/app/agent:ro`), so the script can't write the catalog from inside.
> - The `apps/` directory is NOT bind-mounted, so the script's host-source-tree path isn't reachable from inside.
>
> The host therefore needs `uv` installed locally (separate from the Dockerfile change in Phase 1, which only puts `uv` in the image). Task 3.0 covers this.

### Task 3.0: Install `uv` on the host

- [ ] If `which uvx` returns nothing on the host: `curl -LsSf https://astral.sh/uv/0.11.7/install.sh | sh`. Add `~/.local/bin` to PATH if the installer prompts. Verify: `uvx --version` prints `0.11.x`.
- [ ] If already installed at any 0.4+ version, skip.

### Task 3.1: Run

- [ ] On the host: `PRIVATE_API_KEY=pk_... node apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs --fetch-from-mcp`
- [ ] Output expectation: each entry without an env var present logs `skip <id>: missing env var <NAME>` (warning, not error). Klaviyo logs `fetching tools from live MCP for klaviyo...` and `klaviyo: <N> tools updated`.
- [ ] Inspect diff in `agent/connectors-catalog.json`: only Klaviyo's `tools[]` changes (from `[]` to ~60+). Other entries' `tools[]` untouched.
- [ ] Inspect diff in `apps/worker/tests/connectors-e2e/__snapshots__/catalog-tools.snap`: Klaviyo key added; other keys unchanged.
- [ ] **Caveat**: regen does NOT invoke `authCheckTool` (`get_account`) — only `tools/list`. A syntactically-valid-but-unauthorized token may pass regen with an empty/partial tool list. Real credential validation happens in Task 6.2 via `POST /catalog/klaviyo/test`, which DOES pass `authCheckTool` per spec 0038 F#2.

### Task 3.2: Spot check categories

- [ ] `get_*` / `list_*` → read; `create_*` / `update_*` / `delete_*` → write; rest → interactive.

## Phase 4 — Brand icon

### Task 4.1: Download

- [ ] Source: Klaviyo's brand assets (e.g., the favicon at `https://www.klaviyo.com/favicon.ico` won't work as SVG; use their public-asset SVG or a recreated one).
- [ ] Save as `agent/assets/connectors/klaviyo.svg`. Sanity-check size + content.

## Phase 5 — Quality gate

- [ ] `pnpm -w run quality-gate` green.

## Phase 6 — Manual smoke

### Task 6.1: Deploy

- [ ] `pnpm run docker:build` (already done in Phase 1.2; re-runs if catalog changes need pickup).
- [ ] `PROFILE=<your-profile> pnpm run docker:up`.
- [ ] Wait for API up.

### Task 6.2: API smoke

- [ ] Bad token → `{ok: false, errorKind: 'auth'}`.
- [ ] Real token → `{ok: true, tools: [<60+>]}`.

### Task 6.3: UI smoke

- [ ] Catalog card → modal → paste real key → Test → ✓ → Add.
- [ ] Detail page renders 60+ tools.

### Task 6.4: Slack smoke

- [ ] Send DM to `D0EXAMPLE000` (operator ↔ zeno-agent DM, established in spec 0036's runbook): `[smoke klaviyo] me dá um resumo das últimas 3 campanhas`.
- [ ] Wait ≤90s.
- [ ] Verify reply has structured campaign data (campaign names, send dates, open rates, etc.).
- [ ] DB: `connector_invocations` row with `tool_name=mcp__klaviyo__<actual-name>` (the exact name is determined after Phase 3 regen — for the smoke prompt above, expect a campaigns-related read tool such as `get_campaigns`, `list_campaigns`, or whatever the regenerated `tools[]` contains) and `result='ok'`.

### Task 6.5: Persist evidence

- [ ] `tmp/0040-validation/`.

## Phase 7 — Close

### Task 7.1: Spec status

- [ ] `spec.md` front-matter `status: shipped`, `shipped: <date>`.

### Task 7.2: Optional learning note

- [ ] If anything non-obvious surfaced (uvx caching behavior, image size growth, MCP package quirk) → write a short note under `context/learnings/`.

### Task 7.3: Commit on a feature branch + open PR (with explicit user authorization)

- [ ] Create a feature branch (e.g., `feat/connector-klaviyo`) and commit with a detailed message there. Do NOT commit directly on main — per global CLAUDE.md, deploys/automations trigger on main and a separate PR is the safe path.
- [ ] Wait for explicit user authorization to push the branch.
- [ ] Open a PR using `/open-pr` (project-required command) — auto-generates title + description.
- [ ] Wait for explicit user authorization before merging into main.

## Definition of Done

- 3 clean reviews.
- Dockerfile + catalog + icon committed.
- Quality gate green.
- Manual smoke green.
