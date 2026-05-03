---
feature: connector-swarmia
plan: "[[plan-connector-swarmia]]"
spec: "[[spec-connector-swarmia]]"
created: 2026-04-27
---
# Swarmia Connector — Tasks

**For this plan:** `[[plan-connector-swarmia]]`

## Phase 0 — Spec finalization

- [x] Author docs
- [x] R1 / R2 (cross-check) / R3. Cleared after multiple rounds.
- [x] `status: approved` front-matter.

## Phase 1 — Hard prerequisite gate

> **GATE: This phase and all later phases (3–7) are BLOCKED until specs 0039 (regenerator patch) and 0040 (Dockerfile `uv`) have shipped. Run both gate tasks first; if either fails, do not proceed.**

### Task 1.1: Verify spec 0040's `uv` is present

- [ ] `docker run --rm zeno-agent:dev uvx --version` prints a 0.11.x version. If not, spec 0040 has not shipped — STOP.
- [ ] `docker run --rm --user node zeno-agent:dev uvx --version` also prints (matches the runtime user context).

### Task 1.2: Verify spec 0039's regenerator patch is present

- [ ] `grep -n "skip.*: missing env var" apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs` should match a `console.warn(...)` line.
- [ ] If grep returns nothing, spec 0039 has not shipped — STOP. Phase 3 will abort otherwise on the first non-Swarmia entry with a missing token.

## Phase 2 — Catalog entry

### Task 2.1: Append `swarmia` to `agent/connectors-catalog.json`

- [ ] Insert at the alphabetical position. Today's order (assuming 0039+0040 shipped first): `klaviyo, linear, sentry`. Swarmia goes AFTER `sentry` (`s-w` > `s-e`). If a future entry breaks ordering rules, move accordingly.
- [ ] Fields per plan §Phase 2.
- [ ] `tools: []` initially.

### Task 2.2: Validate JSON

- [ ] `python3 -m json.tool agent/connectors-catalog.json > /dev/null` — clean.

## Phase 3 — Tool list regeneration

> **Execution context**: Phase 3 runs **on the host**, not inside the container. Reasons:
> - `agent/connectors-catalog.json` is bind-mounted into the container as **read-only** (`infra/docker-compose.fn.yml` line 16: `./agent:/app/agent:ro`).
> - The `apps/` directory is NOT bind-mounted, so the script's path inside the container would point at the baked image copy, not the host source tree.
>
> Therefore the host needs `uv` installed locally (separate from the Dockerfile change in spec 0040). Task 3.0 covers this.

### Task 3.0: Install `uv` on the host

- [ ] If `which uvx` returns nothing on the host: `curl -LsSf https://astral.sh/uv/0.11.7/install.sh | sh`. Add `~/.local/bin` to PATH if needed (the installer prints a message). Verify: `uvx --version` prints `0.11.x`.
- [ ] If `uvx --version` already prints `0.11.x` or newer, skip — newer is acceptable. If older than `0.11.x`, install `0.11.7` via the curl line above to align with the Dockerfile pin.

### Task 3.1: Pre-warm uvx git cache

- [ ] On the host: `uvx --from git+https://github.com/mattjegan/swarmia-mcp swarmia-mcp --help`. First run clones the repo and resolves dependencies (~10-30s); subsequent runs use the local cache. **A non-zero exit from `--help` is acceptable here** — the goal is to populate uvx's cache, not to validate the CLI. If `--help` isn't a recognized flag, uvx still resolves and stores the package; the regenerator's later spawn will be cache-hit.
- [ ] If the regenerator times out on first run because uvx is still cloning, re-run the regenerator after this warmup.

### Task 3.2: Run regenerator

- [ ] On the host: `SWARMIA_API_TOKEN=<...> node apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs --fetch-from-mcp`
- [ ] Output expectation: each entry without an env var present logs `skip <id>: missing env var <NAME> (set it to fetch tools for this entry)` (this exact format is the one shipped by spec 0039's regenerator patch — see `2026-04-26-connector-linear/tasks.md` Task 2.0). Swarmia logs `fetching tools from live MCP for swarmia...` and `swarmia: <N> tools updated`.
- [ ] Inspect diff: only Swarmia's `tools[]` changes; other entries' `tools[]` untouched.
- [ ] Snapshot file updated in lockstep.
- [ ] **Caveat**: regen does NOT call `authCheckTool` (`dora_metrics`) — only `tools/list`. Real auth validation happens in Task 6.2 via `POST /catalog/swarmia/test`, which does pass `authCheckTool` per spec 0038 F#2.

### Task 3.3: Spot check categories

- [ ] `dora_metrics`, `team_metrics`, `repository_metrics` will land as `interactive` (none start with `read_`/`list_`/`get_`/`search_`/`find_` per `classifyToolCategory` in `packages/mcp-discover/src/discover.ts:22-29`). Confirm in the catalog diff. Default permission for interactive = `ask` (auto-allowed for owner via classifier_gate).

## Phase 4 — Brand icon

### Task 4.1: Download Swarmia's SVG

- [ ] Try `https://www.swarmia.com/favicon.svg` (their site favicon). If not SVG, look for their public brand assets page or grab the avatar from the GitHub `mattjegan/swarmia-mcp` repo as a fallback.
- [ ] Save as `agent/assets/connectors/swarmia.svg`. Sanity-check it's valid SVG (`< 10KB`, opens in browser).

## Phase 5 — Quality gate

- [ ] `pnpm -w run quality-gate` green.

## Phase 6 — Manual smoke

### Task 6.1: Deploy

- [ ] `pnpm run docker:build`.
- [ ] `PROFILE=fn pnpm run docker:up`.
- [ ] Wait for API up.

### Task 6.2: API smoke

- [ ] Login + capture cookies.
- [ ] `POST /api/connectors/catalog/swarmia/test` with bad token → expect `{ok: false, errorKind: 'auth'}`.
- [ ] Same with real token (`tmp/connector-tokens/tokens.env` SWARMIA_API_TOKEN) → expect `{ok: true, tools: [<3-5>]}`.

### Task 6.3: UI smoke

- [ ] `http://localhost:3001/connectors` → Swarmia card with brand icon. (Port 3001 is correct for the `fn` profile per `infra/docker-compose.fn.yml` mapping `3001:3000`. CLAUDE.md's `localhost:3000` reference is for the `default` profile.)
- [ ] Click → modal → paste real token → Test → ✓ → Add.
- [ ] Click the Swarmia card in the installed section → detail page lists tools (read/write/interactive panels) with default permissions.

### Task 6.4: Slack smoke

- [ ] Send DM to `D0EXAMPLE000`: `[smoke swarmia] qual a deploy frequency da última semana?`.
- [ ] Wait ≤90s.
- [ ] Verify reply has structured DORA data (a numeric deploy frequency, optionally lead time / change-failure rate).
- [ ] DB: `connector_invocations` row with `tool_name='mcp__swarmia__dora_metrics'` (or whatever exact name regen produced) and `result='ok'`.

### Task 6.5: Persist evidence

- [ ] `tmp/0041-validation/` with API smoke output, UI screenshot, Slack reply, DB query result.

## Phase 7 — Close

### Task 7.1: Spec status

- [ ] `spec.md` front-matter `status: shipped`, `shipped: <date>`.

### Task 7.2: Optional learning note

- [ ] If anything non-obvious surfaced (uvx-from-git slowness, Swarmia API rate limit, tool category surprise) → write a short note under `context/learnings/`.

### Task 7.3: Commit on a feature branch + open PR (with explicit user authorization)

- [ ] Create a feature branch (e.g., `feat/connector-swarmia`) and commit with a detailed message there. Do NOT commit directly on main.
- [ ] Wait for explicit user authorization to push the branch.
- [ ] Open a PR using `/open-pr`.
- [ ] Wait for explicit user authorization before merging into main.
