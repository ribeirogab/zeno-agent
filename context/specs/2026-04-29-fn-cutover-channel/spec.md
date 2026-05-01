---
status: draft
feature: fn-cutover-channel
created: 2026-04-29
shipped: null
---
# Spec 0058 — Migrate `profiles/fn` to Slack channel connector (production cutover)

**Status:** Draft
**Branch:** `feat/spec-2026-04-29-fn-cutover-channel` (worktree: `../zeno-agent-worktrees/2026-04-29-fn-cutover-channel/`)
**Scope:** Live cutover of `profiles/fn` from `.env`-based Slack credentials to DB-stored channel-connector credentials shipped in spec 0057. Includes the cutover playbook (Phases A-G, executive) AND the code cleanup that removes the now-dead `.env` fallback path (Phase H, code change). Single PR: docs + cleanup commit. Operator's daily Slack workflow with Zeno is paused for ~10 minutes during the maintenance window. Stacked on `main` once PR #22 lands.

## Context

Spec 0057 (PR #22) introduces `kind: 'channel'` connectors backed by the existing `connectors` table, parsed from `agent/channels-catalog.json`. The Slack adapter's credential source is now resolved at worker boot via `apps/worker/src/channels/slack/resolve-credentials.ts` — DB-first, with `.env` as a backward-compat fallback. **No profile is migrated by spec 0057** — `profiles/fn` keeps using `.env` because that's the only path that exists in production at PR-merge time.

`profiles/fn` is the operator's (Operator's) primary chat-with-AI surface. The container `zeno-fn-agent-1` runs continuously on port 3001; the operator interacts via Slack workspace `acme.slack.com`, primarily channel `C0EXAMPLE001`. Slack credentials currently live in `profiles/fn/.env` as `SLACK_APP_TOKEN`, `SLACK_BOT_TOKEN`. Other secrets in the same file (`GH_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN`, `DASHBOARD_PASSWORD`, `SENTRY_ACCESS_TOKEN`, ...) are NOT touched by this cutover — only the two Slack tokens move to DB.

After PR #22 lands and the container is rebuilt, the worker boots with the resolver in place but still resolves via `env_fallback` (DB has no Slack channel installed yet). This spec walks the cutover end-to-end: install the channel, validate, remove the envvars, restart, validate cold boot via DB-only path, then delete the now-dead fallback code.

## Problem Statement

Three problems, in priority order:

1. **`profiles/fn` is the lone exception to the dashboard-managed credentials model.** Every other integration (Sentry, Linear, GitHub App, Klaviyo, Swarmia, Playwright) is installed via `/connectors` UI; Slack alone requires manual `.env` editing. Spec 0057 made it possible to fix; spec 0058 actually does fix.

2. **Dead-code rot risk.** Once `profiles/fn` is on the DB path, the `.env` fallback in `resolve-credentials.ts` (cases 3 + 5 of the resolution table) becomes unreachable. Per the project constitution, dead code is a liability — uncovered branches drift, types drift, tests assert behavior the system can never hit. Removing it is part of finishing the cutover, not a separate concern.

3. **Cutover risk to a daily-use surface.** Operator uses Zeno via Slack daily. The cutover MUST NOT leave him without a working Slack→Zeno path. The operational sequencing matters more than the code change.

## Non-Goals

The following are explicitly OUT of scope for spec 0058:

- **Migrating any other profile.** Only `profiles/fn` exists today. Future profiles MUST install Slack via dashboard from day one — Phase H removes the `.env` fallback, so the dashboard is the only credential source. See Risks for the new-profile-onboarding consequence.
- **Adding new channels.** Telegram, WhatsApp, etc. are future specs (0066+). 0058 only migrates the existing Slack channel.
- **Refactoring the resolver beyond removing `.env` paths.** The 6-row resolution table simplifies to 4 cases (no env_fallback) — that's the only change. Renaming, restructuring, performance work — all out of scope.
- **Changing the dashboard install UX.** Spec 0058 installs via direct API call (`POST /api/connectors` with `kind: 'channel'`, via curl with auth cookie). No UI changes; the dashboard already has an "Add" flow for connectors that works for channels too (since they share storage), but exercising the UI vs. API doesn't change anything material. We use API for reproducibility + scriptability.
- **Telegram/WhatsApp seed in `channels-catalog.json`.** Strict YAGNI. Those go in their own specs.
- **Updating `profiles/default/.env.example`** to remove `SLACK_*_TOKEN` placeholders. After Phase H ships, the example file is misleading (envvars no longer read), but updating it is a documentation chore that can ride with the next spec touching the example file.
- **Worker restart automation.** Manual `docker compose restart` is fine for one operator. No need for a graceful-restart wrapper.

## Approach

The cutover is 8 phases. Phases A-G are EXECUTIVE (commands, dashboard interactions, Slack messages — no commits). Phase H is the only CODE phase (deletes the fallback, simplifies the resolver, drops tests). The single PR consists of: spec/plan/tasks docs + Phase H code change + a learning note documenting the cutover.

### Phase A — Pre-flight + merge + rebuild

**Image-sharing note:** both `infra/docker-compose.default.yml` and `infra/docker-compose.fn.yml` use the same `image: zeno-agent:dev` tag. The `pnpm run docker:build` script targets the default compose file but **rebuilds the shared image** that the fn container will use on next restart. No `PROFILE=fn pnpm run docker:build` is needed; in fact, that wouldn't work — the script doesn't read `PROFILE`. Restart of the fn container DOES use `PROFILE=fn` since it picks the right compose file.

**Catalog file note:** PR #22 introduces `agent/channels-catalog.json` (new file — does NOT exist in `main` today). Pre-flight check A.5 verifies it landed after the merge.

**CHECKPOINT.** Three operations require explicit operator consent (cleanup contract Rule 4 + CLAUDE.md Rule 20):
- Merge PR #22 (lands new code on `main`, including migration 18 + new `channels-catalog.json` + resolver code path).
- `pnpm run docker:build` (rebuild shared `zeno-agent:dev` image with new code).
- `PROFILE=fn pnpm run docker:down && PROFILE=fn pnpm run docker:up` — cold-restart fn container with new image (uses `down/up` instead of `restart` so the container process is fresh, no in-memory env carry-over).

**Pre-flight checks (no consent needed, run before asking):**
1. Verify PR #22 is mergeable (no conflicts with main): `gh pr view 22 --json mergeable`.
2. Verify quality gate green on PR #22's HEAD (`gh pr checks 22` if CI is wired; otherwise local re-run from worktree).
3. **Verify PR #22 actually landed the surfaces this cutover depends on.** Grep the PR #22 diff (regexes are loose to match Hono route registrations like `app.get('/api/channels', ...)` or `route.get('/', ...)` mounted on `/api/channels`):
   ```bash
   gh pr diff 22 | grep -E 'listByKind|channels-catalog|kind:[ ]*ConnectorKind|/api/channels|kind:[ ]*[\"'"'"']channel[\"'"'"']' | head -30
   ```
   Expected: hits for each of the 7 PR #22 surfaces listed in the "API + storage surface note" below. If any surface is missing, halt — Phase H will fail to compile and Phase C will silently misbehave. Get PR #22 amended before continuing.
4. **Verify PR #22 replaced the `index.ts` SlackChannel spread.** The current `apps/worker/src/index.ts` has `new SlackChannel({ ...config.slack, workspaceDir })`. PR #22 must have replaced the `...config.slack` spread with a `resolveSlackCredentials(...)` call:
   ```bash
   gh pr diff 22 -- apps/worker/src/index.ts | grep -E 'resolveSlackCredentials|config\.slack'
   ```
   Expected: the spread is removed in the diff and `resolveSlackCredentials` is called. If not, Phase H will leave behind a broken spread when `Config.slack` is removed.
5. Backup `profiles/fn/.env` to `tmp/profiles-fn-env-backup-<isodate>.env` (gitignored). Verify the file size is ~same as the original (sanity check).

**Post-merge + post-rebuild verification:**
6. Container boots successfully (`docker compose -f infra/docker-compose.fn.yml logs --tail=50 agent` shows `event: zeno_online` — the worker's end-of-init signal — followed by `event: slack_connected` with `botUserId` from the Slack adapter).
7. New catalog file landed: `ls -la agent/channels-catalog.json` exists with Slack entry; `agent/assets/connectors/slack.svg` exists.
8. Migration 18 applied (`docker exec zeno-fn-agent-1 sqlite3 /workspace/zeno.db 'SELECT MAX(id) FROM migrations'` → `18`).
9. Worker still resolves Slack via `env_fallback` (logs show `slack_creds_source: 'env_fallback'`). Confirms the new code path is in place AND the existing `.env` still works as fallback.

If any check fails: **rollback Stage 0** (don't proceed; investigate; PR #22 may need a fix and re-merge).

### Phase B — Heads-up to operator's working channel

Post a message to `C0EXAMPLE001` (operator's main Zeno channel) BEFORE any cutover step that affects responsiveness:

```
🚧 cutover em progresso (spec 0058 — Slack como connector). Volto em ~10min. NÃO me marca enquanto isso.
```

This prevents Operator from confusing the cutover window with Zeno being broken / ignoring him. Sent via Slack MCP from the operator side (reusing the same flow as spec 0056 testing).

### Phase C — Install Slack channel via dashboard API

**API + storage surface note (everything below introduced by PR #22):**
- New endpoint `GET /api/channels` — list installed channels.
- New endpoint `GET /api/channels/catalog` — list catalog entries.
- `kind: 'channel'` field on `POST /api/connectors`'s catalog branch (in `createCatalogSchema`).
- New file `agent/channels-catalog.json` (Slack entry).
- New `ConnectorRepo.listByKind('channel')` method (used by Phase H resolver code).
- `ConnectorRepo.list({ kind: 'channel' })` filter on the existing `list()` method.
- `Connector.kind` and `CreateConnectorInput.kind?` type fields.

None of these exist on `main` before PR #22 lands. Phase A.6-9 verifies PR #22 is merged + container has the new code; only after that do these surfaces work.

Login flow + install via curl:

1. POST `/api/auth/login` with `DASHBOARD_PASSWORD` from `.env`, capture session cookie.
2. GET `/api/channels/catalog` — verify Slack entry available; capture both required secret keys (`SLACK_APP_TOKEN`, `SLACK_BOT_TOKEN`).
3. POST `/api/connectors` with body (note: `kind: 'channel'` is the discriminator added by PR #22's `createCatalogSchema`):
   ```json
   {
     "source": "catalog",
     "catalogId": "slack",
     "kind": "channel",
     "secrets": [
       { "key": "SLACK_APP_TOKEN", "value": "<from profiles/fn/.env>" },
       { "key": "SLACK_BOT_TOKEN", "value": "<from profiles/fn/.env>" }
     ]
   }
   ```
   Expect HTTP 204 (no body).
4. GET `/api/channels` — verify Slack row present (response shape: `{ id, slug, displayName, status, ... }`; `slug: 'slack'`, `status: 'enabled'`). **Capture the `id` value** — needed for rollback Stage A if a later step fails.

5. **`kind` round-trip verification** (BLOCKING gate before Phase D): GET `/api/connectors/<id>` (using the id from step 4) and assert the response body has `kind === 'channel'`. This catches the Zod-silent-strip failure mode where `POST` returns 204 but the row landed as a plain MCP connector (e.g. if PR #22 wired `kind` into the API but not into the `Connector` row materialization or detail endpoint). **Failure conditions:**
   - `response.kind === 'channel'` → PASS, proceed to Phase D.
   - `response.kind === 'mcp'` → Zod stripped `kind` from POST body OR the row materialized with default. Rollback Stage A; fix PR #22 plumbing.
   - `response.kind === undefined` (field absent) → PR #22 didn't expose `kind` on the connector detail endpoint. Treat as a PR #22 gap; halt and fix before continuing.

**Async install — poll, don't expect synchronous:** `POST /api/connectors` enqueues a `connector_create` command (the worker processes the queue out-of-band). `GET /api/channels` immediately after POST may return an empty list because the worker hasn't picked up the command yet. Poll: query `GET /api/channels` every 1s for up to 10s; if the row hasn't appeared by then, fail loudly and rollback Stage A. The worker logs `event: command_processed` (or similar) when it handles a queue item — useful to confirm progress while polling. (Verify exact log event name post-merge; PR #22 doesn't change the existing command-queue plumbing.)

**Worker is NOT restarted yet.** Channel install only writes to DB; the running worker still uses `.env` (resolver is called once at boot). This is intentional — install is verified DB-side before any restart.

### Phase D — Remove `SLACK_*_TOKEN` from `profiles/fn/.env`

Edit `profiles/fn/.env` removing exactly these 2 lines:
```
SLACK_APP_TOKEN=xapp-...
SLACK_BOT_TOKEN=xoxb-...
```

Verify the diff is exactly 2 lines removed, no other changes (use a glob to avoid date typos under time pressure):
```bash
diff <(grep -v '^SLACK_' tmp/profiles-fn-env-backup-*.env) profiles/fn/.env
```
Expected: exit code 0 (identical when SLACK_* lines are stripped from the backup). If multiple backup files exist (e.g., from a previous failed cutover attempt), the glob expands to all of them — disambiguate by listing `ls -la tmp/profiles-fn-env-backup-*.env` first and pick the latest by mtime.

**The container is still running with the old `.env` cached in memory.** That's fine — the file edit doesn't take effect until restart.

### Phase E — Cold restart + DB-path verification

Restart fn container:
```bash
PROFILE=fn pnpm run docker:down
PROFILE=fn pnpm run docker:up
```

(Use `down/up` rather than `restart` to ensure cold boot — `restart` re-uses the same container and may have memory artifacts; `down/up` creates a fresh process.)

Wait for boot (poll `docker logs zeno-fn-agent-1 -f` until the worker emits `event: zeno_online` — the actual end-of-init log signal in `apps/worker/src/index.ts`).

**Cold-boot verification (per subagent counterpoint #2 — guards against shared-state leak):**
1. Worker logs show `slack_creds_source: 'connector_secrets'` (NOT `'env_fallback'`).
2. Worker logs show `slack_connected` + `botUserId: U0EXAMPLE000`.
3. Container env confirms no `SLACK_*_TOKEN` set: `docker exec zeno-fn-agent-1 sh -c 'env | grep -E "^SLACK_"' || echo "no slack envs (correct)"`.

If any check fails: rollback Stage B/C (restore `.env`, restart).

### Phase F — Two-tier validation

**Both tiers mandatory.** Run from a session that owns the operator side of Slack (Operator's account or the slack-mcp tool with operator's permissions).

**Tier 1 — basic ping** (proves resolver booted with DB tokens):
1. Send `<@U0EXAMPLE000> oi` in `C0EXAMPLE001`.
2. Expect Zeno reply within 30s (any reply text — what matters is the message was received and the agent responded).
3. Verify worker logs show inbound message received + agent invoked.

**Tier 2 — skill invocation** (proves end-to-end inbound→agent→outbound path with new resolver in hot path):
1. Pick an existing skill: `fn-sentry-fix` (works against the fn profile's Sentry connector) OR `fn-code-review` (against GitHub).
2. Send a real invocation: `<@U0EXAMPLE000> fn-sentry-fix <some-issue-or-clarification>`.
3. Expect Zeno end-to-end run: Phase 1 fetch → Phases 2-4 → Phase 7 final structured Slack reply.
4. Cleanup any test artifacts (close test PRs, mark Sentry issue not-resolved per spec 0055/0056 testing rule).

**Cross-validation (smoke tests for non-Slack connectors):**
- Sentry MCP still works: agent calls `mcp__sentry__list_issues` during Tier 2.
- Linear connector still works: hit dashboard `/api/connectors/<linear-id>/test` (since this profile has Linear enabled).

If any tier fails: rollback Stage C (restore `.env`, restart, investigate).

### Phase G — All-clear

Post to `C0EXAMPLE001`:

```
✅ cutover spec 0058 completo. Slack via DB connector agora.
```

Delete `tmp/profiles-fn-env-backup-<isodate>.env` after stability is confirmed (recommend keeping for at least 24h before deletion — local backup, no security risk).

### Phase H — Code cleanup (Option B from Q4)

Now that `profiles/fn` is on DB-only and the operator confirms stability, remove the dead `.env` fallback code in a final commit on this branch. **All these changes ship in the same PR as the spec docs.**

**Files to modify:**

1. `apps/worker/src/channels/slack/resolve-credentials.ts` — simplify the resolver. The 6-row resolution table collapses to 4 cases (no env_fallback):
   ```ts
   import type { Logger } from '@zeno/logger';
   import type { ConnectorRepo } from '@zeno/storage';

   export interface SlackCredentialsResolverDeps {
     connectors: ConnectorRepo;
     logger: Logger;
   }

   export interface ResolvedSlackCredentials {
     appToken: string;
     botToken: string;
   }

   export function resolveSlackCredentials(deps: SlackCredentialsResolverDeps): ResolvedSlackCredentials {
     const { connectors, logger } = deps;
     const slack = connectors
       .listByKind('channel')
       .find((c) => c.slug === 'slack' && c.status === 'enabled');

     if (!slack) {
       const msg = 'Slack channel not installed — install via dashboard at /connectors';
       logger.error({ event: 'slack_creds_missing' }, msg);
       throw new Error(msg);
     }

     const secrets = connectors.getSecrets(slack.id);
     const appToken = secrets.find((s) => s.key === 'SLACK_APP_TOKEN')?.value;
     const botToken = secrets.find((s) => s.key === 'SLACK_BOT_TOKEN')?.value;

     if (!appToken || !botToken) {
       const msg = 'Slack channel installed but credentials missing — fix via dashboard or uninstall';
       logger.error({ event: 'slack_creds_empty_after_install', connectorId: slack.id }, msg);
       throw new Error(msg);
     }

     logger.info({ event: 'slack_creds_resolved', connectorId: slack.id }, 'Slack creds resolved from DB');
     return { appToken, botToken };
   }
   ```
   Notes:
   - `env` removed from `SlackCredentialsResolverDeps`.
   - `source` field removed from `ResolvedSlackCredentials` (always DB now; the field was only meaningful when there were two sources).
   - The "disabled" case collapses with "no row" — both throw the same error. A disabled channel is operator misconfiguration; throwing surfaces it loud, where falling back to a now-non-existent env would just produce a deeper error later.

2. `apps/worker/tests/channels/slack/resolve-credentials.test.ts` — drop tests for cases 3, 4, 5, 6 of the old resolution table; keep only:
   - Case 1 (enabled + both secrets → returns creds, no `source` assertion).
   - Case 2 (enabled + missing secret → throws `credentials missing`).
   - New case 3 (disabled OR no row → throws `not installed`).
   - New case 4 (no enabled channels at all → throws).

3. `apps/worker/src/config.ts` — remove `SLACK_*_TOKEN` from Zod schema entirely; remove `slack` from `Config` type. Slack creds are no longer routed through config at all — the resolver gets them straight from `connectors`.

4. `apps/worker/tests/config.test.ts` — when `Config.slack` is removed (item 3), three groups of tests become incorrect. **Identify them by grep, NOT by line number** (PR #22 changed the file shape):
   ```bash
   grep -nE 'SLACK_APP_TOKEN|SLACK_BOT_TOKEN|cfg\.slack' apps/worker/tests/config.test.ts
   ```
   Then triage each match:
   - Pre-PR-#22 tests that asserted `loadConfig()` THROWS on missing/malformed SLACK tokens — invalid after PR #22 (which made them optional) and after Phase H (which removed them). **Drop**.
   - PR-#22-added tests asserting SLACK is OPTIONAL in the schema. **Drop** (the field is gone after Phase H).
   - The `loads valid config` happy-path test, if it asserts on `cfg.slack.appToken`. **Update or drop the assertion**.
   - **DO NOT TOUCH** any test for non-SLACK envvars (e.g. `CLAUDE_CODE_OAUTH_TOKEN`, `GH_TOKEN`) — those remain required. The grep above scopes correctly to SLACK only.

5. `apps/worker/src/index.ts` — update the resolver call (introduced by PR #22 around the SlackChannel construction site) to drop `env: config.slack`:
   ```ts
   // Before (PR #22): const slackCreds = resolveSlackCredentials({ connectors, env: config.slack, logger });
   // After (Phase H):
   const slackCreds = resolveSlackCredentials({ connectors, logger });
   ```
   Locate the call by grepping for `resolveSlackCredentials(` — line numbers will shift between specs.

6. `apps/worker/tests/channels/slack/boot-integration.test.ts` — drop the "env fallback" test case (no longer reachable); keep the "DB credentials" case.

7. `context/specs/2026-04-29-slack-channel/spec.md` — append a single-line errata note: `Update 2026-MM-DD: spec 0058 removed the .env fallback path described in Track 3. The resolution table now has 4 rows, not 6.` Keep the rest of 0057's spec for historical context.

**Docker command style:** all Phases A-E use `PROFILE=fn pnpm run docker:<verb>` form (delegates to `infra/docker.sh`). Direct `docker compose -f infra/docker-compose.fn.yml ...` invocations are listed only as alternatives where the pnpm script wouldn't do what we need (e.g. `docker compose logs --tail=50` for one-shot log inspection). Stick to `pnpm run docker:logs` if it works; only fall through to direct compose for read-only queries.

**Quality gate:** `pnpm run quality-gate` must pass green after Phase H. All existing tests still green minus the 4-5 deleted ones; expect total to drop from 585 → ~581.

**3-round branch review:** per cleanup contract Rule 2 (in `tmp/zeno-cleanup-contract.md`), run R1+R2+R3 reviews on the branch state (docs + Phase H diff). Each review is independent (fresh subagent, no prior-review context). On ANY blocking finding, reset the counter to R1. Concluído = 3 consecutive clean reviews.

## Architecture

This is mostly an EXECUTIVE spec, so the "architecture" is the operational sequencing + the rollback graph.

### Sequencing diagram

```
[A.1-5 pre-flight + PR-22-diff verify + backup] ──┐
                              ▼
            ┌───── CHECKPOINT (operator consent) ─────┐
            │                                          │
            ▼                                          │
  [merge PR #22] ──► [rebuild image] ──► [restart fn container]
                                                       │
                                                       ▼
                                            [A.6-9 verify env_fallback]
                                                       │
                                                       ▼
                                              [B heads-up to Slack]
                                                       │
                                                       ▼
                                       [C install Slack channel via API]
                                                       │
                                          ┌────────────┤ rollback Stage A
                                          │ (uninstall │ if install verify fails
                                          │  channel)  │
                                                       │
                                                       ▼
                                  [D edit .env to remove SLACK_*]
                                                       │
                                                       ▼
                                       [E cold restart + DB-path check]
                                                       │
                                          ┌────────────┤ rollback Stage B
                                          │ (restore   │ if creds_source != connector_secrets
                                          │  .env,     │
                                          │  restart)  │
                                                       │
                                                       ▼
                                          [F Tier 1 + Tier 2 validation]
                                                       │
                                          ┌────────────┤ rollback Stage C
                                          │ (restore   │ if Tier 1 or Tier 2 fails
                                          │  .env,     │
                                          │  restart)  │
                                                       │
                                                       ▼
                                            [G all-clear to Slack]
                                                       │
                                                       ▼
                                       [H code cleanup commit + tests]
                                                       │
                                                       ▼
                                            [3-round branch review]
                                                       │
                                                       ▼
                                              [Push + open PR]
```

### Rollback table

| Stage | Triggered by | Action | Side effects |
|---|---|---|---|
| **0 (pre-flight)** | A.6-9 fails | Don't proceed. PR #22 may need a fix; investigate. | Operator's Slack still works (env path). |
| **A** | C.4 OR C.5 verify fails (channel not installed in DB OR `kind` round-trip didn't return `'channel'`) | First, get the connector id by direct DB query: `docker exec zeno-fn-agent-1 sqlite3 /workspace/zeno.db "SELECT id, kind FROM connectors WHERE slug='slack'"`. Then `DELETE /api/connectors/<id>` (this endpoint EXISTS pre-PR-#22 — uninstall flow already works for MCP connectors). **If the DELETE endpoint refuses to delete `kind=channel` rows** (some kind-aware logic in PR #22), fall back to direct DB delete: `docker exec zeno-fn-agent-1 sqlite3 /workspace/zeno.db "DELETE FROM connectors WHERE slug='slack'"` — the `connector_secrets` table CASCADEs on FK so secrets clean up automatically. **If the DB query returns the row with kind='mcp' instead of 'channel':** PR #22's `createCatalogSchema` didn't plumb `kind` (Zod silently strips). Delete the row regardless and DON'T proceed — fix PR #22 before retrying. | Container untouched, still on env. No restart. |
| **B** | E.* verify fails (creds_source != connector_secrets, or worker fails to boot) | Restore `.env` from backup (`cp tmp/profiles-fn-env-backup-<isodate>.env profiles/fn/.env`), restart container. Channel can stay installed (DB-first wins; `.env` fallback works again). | Operator's Slack restored to env path. |
| **C** | F.* validation fails (no agent response, or skill invocation fails) | Same as Stage B (restore `.env`, restart). Channel can stay installed (no-op for fallback). | Same as B. |

### Validation tiers

| Tier | Test | Pass criteria | Fail action |
|---|---|---|---|
| **0 (Phase A)** | Worker logs show `env_fallback` source after rebuild | Logs match | Don't proceed; PR #22 broken |
| **1 (Phase F)** | `<@U0EXAMPLE000> oi` in `C0EXAMPLE001` | Agent reply within 30s + worker logs `agent_invoked` | Rollback Stage C |
| **2 (Phase F)** | `<@U0EXAMPLE000> fn-sentry-fix <issue>` | Agent end-to-end response + skill final structured Slack reply | Rollback Stage C |
| **2.5 (cross)** | Other connectors (Sentry, Linear) still work | Skill invocation in Tier 2 calls Sentry MCP successfully | Rollback Stage C |

## Test plan / Success criteria

This spec ships when ALL the following pass on the branch:

**Pre-cutover (Phase A):**
- [ ] PR #22 merged to main with no conflicts.
- [ ] `pnpm run docker:build` completes without error.
- [ ] Container boots; logs show `slack_creds_source: 'env_fallback'`.
- [ ] DB has migration 18 applied.
- [ ] Backup `tmp/profiles-fn-env-backup-<isodate>.env` exists.

**Cutover (Phases B-G):**
- [ ] Slack channel installed via dashboard API (POST returned 204; GET `/api/channels` shows it).
- [ ] `profiles/fn/.env` no longer contains `SLACK_*_TOKEN` (verified via diff).
- [ ] Container cold-restart booted with `slack_creds_source: 'connector_secrets'`.
- [ ] Container env shows no `SLACK_*_TOKEN`.
- [ ] Tier 1 validation: agent responds to `<@zeno> oi` within 30s.
- [ ] Tier 2 validation: skill invocation runs end-to-end and replies to operator with structured success/stuck message.
- [ ] Cross-validation: Sentry MCP / Linear connector still work.
- [ ] All-clear posted to `C0EXAMPLE001`.

**Post-cutover code cleanup (Phase H):**
- [ ] Resolver simplified to 4-case logic (no env path).
- [ ] `Config.slack` field removed from `apps/worker/src/config.ts`; `SLACK_*_TOKEN` removed from Zod schema.
- [ ] `apps/worker/src/index.ts` calls resolver with only `{ connectors, logger }`.
- [ ] Resolver tests reduced from 6 to 4 cases.
- [ ] Boot-integration test reduced from 2 to 1 case.
- [ ] Config tests dropped (3 SLACK-optional tests).
- [ ] `pnpm run quality-gate` GREEN. Total tests ~581 (down from 585 by 4-5 deletions).
- [ ] `context/specs/2026-04-29-slack-channel/spec.md` has a 1-line errata note about the resolution table simplification.
- [ ] Learning note created in `context/learnings/` describing the cutover pattern.

**Branch review (per cleanup contract Rule 2):**
- [ ] R1+R2+R3 fresh reviews CLEAN consecutive (no BLOCKING findings). Reset on any BLOCKING.

**PR ready:**
- [ ] `git diff main..HEAD --stat` shows ONLY: docs (spec/plan/tasks for 0058), Phase H code changes, learning note, errata in 0057. No accidental file changes.
- [ ] PR description summarizes the cutover narrative + Phase H code diff.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Operator pastes wrong tokens into dashboard install (e.g. swaps `SLACK_APP_TOKEN` and `SLACK_BOT_TOKEN`) | Tier 1 validation in Phase F catches it (worker fails to boot or fails to authenticate Slack). Rollback Stage C restores `.env` + restart. Reinstall channel with correct tokens. |
| Cold-boot reads stale env via shared volume / tmpfs leak | Phase E uses `down/up` (NOT `restart`) — creates a fresh container. Verification step explicitly checks container env has no `SLACK_*_TOKEN`. |
| Operator types to Zeno during the cutover window | Phase B heads-up message in `C0EXAMPLE001` warns explicitly. Operator pause is a simple "don't @ me for 10min" ask — non-blocking, low cost. |
| New profile is set up after Phase H lands and tries to use `.env` Slack tokens | After Phase H, ANY profile MUST install Slack via dashboard. New-profile-setup docs need a one-line update (out of scope for 0058; tracked as a docs follow-up alongside Phase H's commit). |
| Phase H reduces test count below quality-gate floor | Test count delta is small (4-5 deletions out of 585 = <1%). Quality gate measures pass/fail, not count, so this isn't a real risk; just a thing to mention in PR description so reviewer doesn't think tests went missing. |
| PR #22 has an undiscovered bug that surfaces only on `profiles/fn` schema | Phase A.6 verifies env_fallback works post-rebuild — that proves the new code path is functional with old tokens. Any bug specific to channel install surfaces in Phase C or E. |
| Slack revokes the old token while we're in the middle of the cutover | Pre-flight backup `.env` includes the working token. Phase C copies it into the dashboard. Token doesn't get re-issued unless someone explicitly rotates — extremely unlikely in a 10-min window. |
| Docker rebuild leaves the old image around and operator accidentally restarts that one | Use `pnpm run docker:build` (rebuilds image with new tag) + explicit `docker compose up -d` (uses latest image). Verify post-restart that the worker logs reflect the new code (e.g., look for the "Slack creds:" log line — only present in spec 0057+ code). |
| Container restart hangs (Slack socket-mode connection takes >30s to establish) | Phase E waits for boot via log polling, not by fixed timeout. If boot doesn't complete in 60s, fail loudly and rollback Stage B. |
| Errata note in 0057's spec.md introduces merge conflicts | The note is appended; conflicts are unlikely. If it happens, resolve manually during Phase H. |

## Open Questions

None blocking. Q1-Q5 closed before writing this spec:

- **Q1 (merge order):** Spec written first; PR #22 merge happens in Phase A with explicit operator consent.
- **Q2 (atomicity):** Minimal-downtime maintenance window (~5-10min), with heads-up message + cold-boot verification (per subagent counterpoints).
- **Q3 (rollback):** Backup `.env` first; 3-stage rollback table.
- **Q4 (code cleanup):** Same spec, last commit (Option B per subagent counterpoint — avoids dead-code rot in single-operator project).
- **Q5 (validation):** Two-tier (Tier 1 ping + Tier 2 skill invocation) + cross-connector smoke tests.

## Out-of-scope follow-ups

- **`profiles/default/.env.example` cleanup.** After Phase H lands, the example file references envvars that the worker no longer reads. A small docs-only PR should remove `SLACK_*_TOKEN` from it. Doesn't ride with 0058 (different concern; example file edits don't fit the cutover narrative).
- **New-profile setup docs.** A README or onboarding doc that says "install Slack via dashboard, do NOT add SLACK_*_TOKEN to .env" — currently no such doc exists. Tracked for a future docs spec.
- **Multi-channel boot loop.** Worker iterates `listByKind('channel')` and instantiates each via a registry. Not needed until Telegram/WhatsApp lands (spec 0066+).
- **Channels UI section in dashboard.** Currently install happens via API call. A future polish spec adds a dedicated "Channels" tab in the dashboard navigation (parallel to "Connectors").
- **Failure-mode telemetry.** When the resolver throws (operator misconfigured channel), the worker exits and Docker restarts it. Adding a clearer signal (e.g. health endpoint that reports "Slack channel not configured") would help future operators. Out of scope; the error message is already loud.
