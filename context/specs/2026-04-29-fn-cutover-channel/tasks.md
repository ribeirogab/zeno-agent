---
feature: fn-cutover-channel
plan: "[[plan]]"
spec: "[[spec]]"
created: 2026-04-29
---
# Spec 0058 — Migrate `profiles/fn` to channel connector — Tasks

**For this plan:** `[[plan]]`

> **For agentic workers:** Phases A-G are EXECUTIVE — run live commands, no commits. Only Phase H produces a commit (the resolver simplification + tests). Per cleanup contract Rule 4: skip approvals for trivia, only stop at the explicit CHECKPOINT in Phase A (merge + rebuild + restart) and the final `git push` / `gh pr create`.
>
> All commands run from the **main repo** (`/Users/operator/www/octocat/zeno-agent/`), NOT the worktree — the worktree only holds the spec docs. Cutover commands target `profiles/fn`, the running container, and the live filesystem.
>
> If any verification step fails, jump to the matching rollback stage in `spec.md` Rollback table — DO NOT improvise.

---

## Phase A — Pre-flight + merge + rebuild

**Goal:** Verify PR #22 is ready, backup `profiles/fn/.env`, get operator consent, merge + rebuild + cold-restart container, verify the new code is live but still resolving via env_fallback.

### Task A.1 — Pre-flight: PR #22 mergeable

- [ ] **A.1.1** Verify PR #22 is mergeable:
  ```bash
  gh pr view 22 --json mergeable,state
  ```
  Expected: `{"mergeable":"MERGEABLE","state":"OPEN"}`. If `CONFLICTING` or anything else, halt — fix conflicts on PR #22 first.

### Task A.2 — Pre-flight: PR #22 quality gate

- [ ] **A.2.1** Run quality gate locally from the spec-0057 worktree (PR #22's branch):
  ```bash
  cd /Users/operator/www/octocat/zeno-agent-worktrees/2026-04-29-slack-channel
  pnpm run quality-gate
  ```
  Expected: 30/30 turbo tasks green. If red, halt — fix on PR #22 branch.

### Task A.3 — Pre-flight: PR #22 surfaces grep

- [ ] **A.3.1** Verify the 7 surfaces this cutover depends on are present in PR #22's diff:
  ```bash
  gh pr diff 22 | grep -E 'listByKind|channels-catalog|kind:[ ]*ConnectorKind|/api/channels|kind:[ ]*[\"'"'"']channel[\"'"'"']' | head -30
  ```
  Expected: lines mentioning each of `listByKind`, `channels-catalog`, `ConnectorKind`, `/api/channels`, and `kind: 'channel'`. If any surface is missing, halt — get PR #22 amended before continuing.

### Task A.4 — Pre-flight: index.ts SlackChannel spread replaced

- [ ] **A.4.1** Verify PR #22 replaced the `...config.slack` spread with `resolveSlackCredentials(...)`:
  ```bash
  gh pr diff 22 -- apps/worker/src/index.ts | grep -E 'resolveSlackCredentials|config\.slack'
  ```
  Expected: `+` lines with `resolveSlackCredentials` AND `-` lines with `...config.slack`. If the spread is still there in the diff's HEAD state, halt — Phase H will leave behind a broken spread.

### Task A.5 — Backup `.env`

- [ ] **A.5.1** Backup current `profiles/fn/.env` to `tmp/`:
  ```bash
  ISODATE=$(date -u +%Y-%m-%dT%H-%M-%SZ)
  cp profiles/fn/.env tmp/profiles-fn-env-backup-${ISODATE}.env
  ls -la tmp/profiles-fn-env-backup-${ISODATE}.env profiles/fn/.env
  ```
  Expected: both files exist, similar sizes. Note the `${ISODATE}` value — needed for Phase D diff.

### Task A.6 — CHECKPOINT — merge + rebuild + restart (operator consent required)

- [ ] **A.6.1** **STOP — operator consent required.** Ask Operator:

  > Tudo pronto pra Phase A. Próximos passos precisam de consentimento explícito (cleanup contract Rule 4 + CLAUDE.md Rule 20):
  > 1. Merge PR #22 (lands new code on main)
  > 2. `pnpm run docker:build` (rebuild shared `zeno-agent:dev` image)
  > 3. `PROFILE=fn pnpm run docker:down && PROFILE=fn pnpm run docker:up` (cold-restart fn container with new image)
  >
  > Total downtime: ~10s during step 3. Pode autorizar?

- [ ] **A.6.2** After consent, merge PR #22:
  ```bash
  gh pr merge 22 --merge --delete-branch
  ```
  Expected: merge commit on `main`. (Use `--merge` for explicit merge commit; `--squash` works too but loses spec 0057's review history.)

- [ ] **A.6.3** Pull main locally:
  ```bash
  git checkout main && git pull origin main
  ```

- [ ] **A.6.4** Rebuild shared image:
  ```bash
  pnpm run docker:build
  ```
  Expected: build completes; `docker images | grep zeno-agent:dev` shows a new build timestamp.

- [ ] **A.6.5** Cold-restart fn container:
  ```bash
  PROFILE=fn pnpm run docker:down
  PROFILE=fn pnpm run docker:up
  ```
  Expected: container `zeno-fn-agent-1` UP within ~10s.

### Task A.7 — Post-rebuild verification: container booted

- [ ] **A.7.1** Wait for boot signal (poll up to 60s):
  ```bash
  until docker logs zeno-fn-agent-1 2>&1 | grep -q '"event":"zeno_online"'; do sleep 2; done
  echo "worker online"
  ```

- [ ] **A.7.2** Verify Slack adapter connected:
  ```bash
  docker logs zeno-fn-agent-1 2>&1 | grep -E '"event":"slack_connected"' | tail -1
  ```
  Expected: line with `botUserId: U0EXAMPLE000`.

### Task A.8 — Post-rebuild verification: catalog + migration

- [ ] **A.8.1** Verify `agent/channels-catalog.json` + Slack icon exist:
  ```bash
  ls -la agent/channels-catalog.json agent/assets/connectors/slack.svg
  ```
  Expected: both exist.

- [ ] **A.8.2** Verify migration 18 applied:
  ```bash
  docker exec zeno-fn-agent-1 sqlite3 /workspace/zeno.db 'SELECT MAX(id) FROM migrations'
  ```
  Expected output: `18`.

### Task A.9 — Post-rebuild verification: env_fallback path active

- [ ] **A.9.1** Verify worker still resolves Slack via `env_fallback` (DB has no Slack channel installed yet):
  ```bash
  docker logs zeno-fn-agent-1 2>&1 | grep '"slack_creds_source"' | tail -1
  ```
  Expected: line containing `"slack_creds_source":"env_fallback"`. Confirms new resolver code is in place AND existing `.env` still works.

  If output shows `connector_secrets` instead, something installed the channel pre-cutover — investigate before proceeding.
  If no output at all, the new resolver isn't in the new code — PR #22 may not have built correctly. Halt + investigate.

---

## Phase B — Heads-up to operator's working channel

**Goal:** Tell Operator (and any other channel members) the cutover is starting.

### Task B.1 — Post heads-up

- [ ] **B.1.1** Send to `C0EXAMPLE001` via Slack MCP (operator side):
  ```
  🚧 cutover em progresso (spec 0058 — Slack como connector). Volto em ~10min. NÃO me marca enquanto isso.
  ```
  Capture the message_ts — needed in Phase G to thread the all-clear.

---

## Phase C — Install Slack channel via dashboard API

**Goal:** Install the Slack channel into the DB while the worker is still running on env_fallback (channel install only writes to DB; resolver re-evaluates at next boot).

### Task C.1 — Login to dashboard

- [ ] **C.1.1** Get the dashboard password:
  ```bash
  DASHBOARD_PWD=$(grep '^DASHBOARD_PASSWORD=' profiles/fn/.env | cut -d= -f2)
  echo "password length: ${#DASHBOARD_PWD}"
  ```
  Expected: a non-zero length.

- [ ] **C.1.2** Authenticate + capture session cookie:
  ```bash
  curl -s -c /tmp/zeno-cookies.txt \
    -X POST http://localhost:3001/api/auth/login \
    -H 'content-type: application/json' \
    -d "{\"password\":\"${DASHBOARD_PWD}\"}"
  ```
  Expected: empty response with 204 OR JSON `{"ok":true}`. `ls -la /tmp/zeno-cookies.txt` should exist.

### Task C.2 — Verify channels catalog endpoint

- [ ] **C.2.1** Call `GET /api/channels/catalog`:
  ```bash
  curl -s -b /tmp/zeno-cookies.txt http://localhost:3001/api/channels/catalog | python3 -m json.tool
  ```
  Expected: JSON with `channels` array containing a Slack entry (id: `slack`, slug: `slack`, name: `Slack`).

### Task C.3 — Install Slack channel

- [ ] **C.3.1** Read the current Slack tokens from `.env`:
  ```bash
  SLACK_APP=$(grep '^SLACK_APP_TOKEN=' profiles/fn/.env | cut -d= -f2)
  SLACK_BOT=$(grep '^SLACK_BOT_TOKEN=' profiles/fn/.env | cut -d= -f2)
  echo "app prefix: ${SLACK_APP:0:5}..., bot prefix: ${SLACK_BOT:0:5}..."
  ```
  Expected: `app prefix: xapp-...` and `bot prefix: xoxb-...`.

- [ ] **C.3.2** POST to `/api/connectors`:
  ```bash
  curl -s -b /tmp/zeno-cookies.txt \
    -X POST http://localhost:3001/api/connectors \
    -H 'content-type: application/json' \
    -d "$(cat <<EOF
  {
    "source": "catalog",
    "catalogId": "slack",
    "kind": "channel",
    "secrets": [
      { "key": "SLACK_APP_TOKEN", "value": "${SLACK_APP}" },
      { "key": "SLACK_BOT_TOKEN", "value": "${SLACK_BOT}" }
    ]
  }
  EOF
  )" -w '\nHTTP: %{http_code}\n'
  ```
  Expected: HTTP 204 (no body).

### Task C.4 — Verify channel installed (poll for async install)

- [ ] **C.4.1** Poll `/api/channels` for the Slack row (the worker's command queue may take 1-3s to process):
  ```bash
  for i in 1 2 3 4 5 6 7 8 9 10; do
    BODY=$(curl -s -b /tmp/zeno-cookies.txt http://localhost:3001/api/channels)
    if echo "$BODY" | python3 -c "import json,sys; d=json.load(sys.stdin); slack=[c for c in d if c.get('slug')=='slack']; sys.exit(0 if slack else 1)" 2>/dev/null; then
      echo "found at attempt $i"
      echo "$BODY" | python3 -m json.tool
      break
    fi
    sleep 1
  done
  ```
  Expected: a Slack row with `status: 'enabled'`. Capture the `id` field — needed for C.5 and rollback.

- [ ] **C.4.2** Set `CHANNEL_ID` from the response:
  ```bash
  CHANNEL_ID=$(curl -s -b /tmp/zeno-cookies.txt http://localhost:3001/api/channels | python3 -c "import json,sys; print(next((c['id'] for c in json.load(sys.stdin) if c.get('slug')=='slack'), ''))")
  echo "channel id: ${CHANNEL_ID}"
  ```
  Expected: a UUID-shaped id.

### Task C.5 — `kind` round-trip verification (BLOCKING gate before Phase D)

- [ ] **C.5.1** GET the connector detail and assert `kind === 'channel'`:
  ```bash
  KIND=$(curl -s -b /tmp/zeno-cookies.txt "http://localhost:3001/api/connectors/${CHANNEL_ID}" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('kind', 'MISSING'))")
  echo "kind: ${KIND}"
  ```

- [ ] **C.5.2** Assert and decide:
  - `kind: channel` → PASS, proceed to Phase D.
  - `kind: mcp` → Zod stripped `kind` from POST. Run rollback Stage A immediately. Halt + fix PR #22.
  - `kind: MISSING` (field absent) → PR #22 didn't expose `kind` on detail endpoint. Run rollback Stage A. Halt + fix PR #22.
  - Anything else → unexpected; halt + investigate.

---

## Phase D — Remove `SLACK_*_TOKEN` from `profiles/fn/.env`

**Goal:** Remove the legacy envvars while the running container still has them in memory (no immediate effect; takes effect on next restart).

### Task D.1 — Edit `.env`

- [ ] **D.1.1** Remove the 2 SLACK lines:
  ```bash
  grep -v '^SLACK_APP_TOKEN=\|^SLACK_BOT_TOKEN=' profiles/fn/.env > profiles/fn/.env.tmp
  mv profiles/fn/.env.tmp profiles/fn/.env
  ```

### Task D.2 — Verify diff is exactly 2 lines removed

- [ ] **D.2.1** Diff against backup to verify only SLACK lines changed:
  ```bash
  diff <(grep -v '^SLACK_' tmp/profiles-fn-env-backup-*.env) profiles/fn/.env
  ```
  Expected: empty output (exit code 0). If non-empty, restore from backup and investigate:
  ```bash
  # Recovery if diff shows unexpected changes:
  cp tmp/profiles-fn-env-backup-*.env profiles/fn/.env
  ```

- [ ] **D.2.2** Verify `SLACK_*_TOKEN` is gone:
  ```bash
  grep '^SLACK_' profiles/fn/.env || echo "no SLACK_ lines (correct)"
  ```
  Expected: `no SLACK_ lines (correct)`.

---

## Phase E — Cold restart + DB-path verification

**Goal:** Restart container with new `.env` (no SLACK tokens) and verify resolver picks up DB tokens.

### Task E.1 — Cold restart (`down`/`up`, NOT `restart`)

- [ ] **E.1.1** Bring down + up:
  ```bash
  PROFILE=fn pnpm run docker:down
  PROFILE=fn pnpm run docker:up
  ```

### Task E.2 — Wait for boot

- [ ] **E.2.1** Poll for `zeno_online`:
  ```bash
  until docker logs zeno-fn-agent-1 --since 1m 2>&1 | grep -q '"event":"zeno_online"'; do sleep 2; done
  echo "worker online (post-cutover)"
  ```

### Task E.3 — Verify DB-path resolver

- [ ] **E.3.1** Check resolver source:
  ```bash
  docker logs zeno-fn-agent-1 --since 1m 2>&1 | grep '"slack_creds_source"' | tail -1
  ```
  Expected: `"slack_creds_source":"connector_secrets"`. **If `env_fallback`, FAIL — rollback Stage B.**

- [ ] **E.3.2** Verify Slack adapter connected with DB tokens:
  ```bash
  docker logs zeno-fn-agent-1 --since 1m 2>&1 | grep '"event":"slack_connected"' | tail -1
  ```
  Expected: `botUserId: U0EXAMPLE000`.

- [ ] **E.3.3** Verify container env has no SLACK tokens:
  ```bash
  docker exec zeno-fn-agent-1 sh -c 'env | grep "^SLACK_" || echo "no slack envs (correct)"'
  ```
  Expected: `no slack envs (correct)`.

  **If this still shows tokens, the cold-boot didn't pick up the new `.env` — investigate (`docker compose down` may not have actually stopped the previous container).**

---

## Phase F — Two-tier validation

**Goal:** Prove the agent still works end-to-end via Slack, with credentials resolving from DB.

### Task F.1 — Tier 1: ping

- [ ] **F.1.1** Send a basic mention to `C0EXAMPLE001` via Slack MCP:
  ```
  <@U0EXAMPLE000> oi
  ```
  Expected: Zeno reply within 30s in the same channel/thread.

- [ ] **F.1.2** Verify worker logs show the message was received + agent invoked:
  ```bash
  docker logs zeno-fn-agent-1 --since 1m 2>&1 | grep -E '"event":"slack_message_received"|"event":"agent_invoked"|"event":"backend_started"'
  ```
  Expected: at least one matching event.

### Task F.2 — Tier 2: skill invocation end-to-end

- [ ] **F.2.1** Send a real skill invocation:
  ```
  <@U0EXAMPLE000> fn-sentry-fix https://flavia-nasser.sentry.io/issues/<some-issue> [zeno-test]
  ```
  Expected: agent runs the full skill end-to-end (Phase 1 fetch → Phase 7 final structured Slack reply with `<@U0AMRKV0T25>` mention to the operator).

- [ ] **F.2.2** Verify worker logs show backend completed:
  ```bash
  docker logs zeno-fn-agent-1 --since 5m 2>&1 | grep '"event":"backend_completed"'
  ```
  Expected: at least one `backend_completed` after F.2.1.

### Task F.3 — Cross-validate other connectors

- [ ] **F.3.1** Verify Sentry MCP still works (was called during F.2.1):
  ```bash
  docker logs zeno-fn-agent-1 --since 5m 2>&1 | grep '"tool":"mcp__sentry__'
  ```
  Expected: at least one Sentry MCP tool call.

- [ ] **F.3.2** Smoke test Linear via dashboard:
  ```bash
  LINEAR_ID=$(curl -s -b /tmp/zeno-cookies.txt http://localhost:3001/api/connectors | python3 -c "import json,sys; print(next((c['id'] for c in json.load(sys.stdin) if c.get('slug')=='linear'), ''))")
  curl -s -b /tmp/zeno-cookies.txt -X POST "http://localhost:3001/api/connectors/${LINEAR_ID}/test" | python3 -m json.tool
  ```
  Expected: `{"ok": true}` or similar success response.

### Task F.4 — Cleanup test artifacts

- [ ] **F.4.1** If F.2.1 opened a test PR, close it:
  ```bash
  # Find the PR number from worker logs
  docker logs zeno-fn-agent-1 --since 5m 2>&1 | grep -oE 'pull/[0-9]+' | tail -1
  # Close (replace <N>)
  gh pr close <N> -R AcmeBooks/acme-monorepo --delete-branch --comment '[zeno-test] closing — spec 0058 cutover validation'
  ```

- [ ] **F.4.2** Verify Sentry issue NOT marked resolved (per test rule from spec 0055).

---

## Phase G — All-clear

### Task G.1 — Post all-clear to `C0EXAMPLE001`

- [ ] **G.1.1** Send (optionally as a thread reply to the heads-up message):
  ```
  ✅ cutover spec 0058 completo. Slack via DB connector agora.
  ```

### Task G.2 — Note backup file for cleanup

- [ ] **G.2.1** Add a reminder in the spec or a TODO list to delete `tmp/profiles-fn-env-backup-*.env` after 24h of stability. Don't delete now — keep for safety.

---

## Phase H — Code cleanup (single commit)

**Goal:** Remove the now-dead `.env` fallback path. This produces the only code commit in this PR.

### Task H.1 — Switch back to worktree

- [ ] **H.1.1** From the main repo, switch to the worktree:
  ```bash
  cd /Users/operator/www/octocat/zeno-agent-worktrees/2026-04-29-fn-cutover-channel
  git status
  ```
  Expected: on branch `feat/spec-2026-04-29-fn-cutover-channel`, clean.

- [ ] **H.1.2** Pull main into the branch (since PR #22 just merged):
  ```bash
  git fetch origin main
  git merge origin/main
  ```
  Expected: clean fast-forward or trivial merge.

### Task H.2 — Simplify `resolve-credentials.ts`

- [ ] **H.2.1** Replace the entire content of `apps/worker/src/channels/slack/resolve-credentials.ts`:

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

  /**
   * Spec 0058: simplified resolver. Spec 0057's 6-row resolution table collapses
   * to 4 cases now that the .env fallback path is removed:
   *   1. enabled DB row + both secrets → returns creds
   *   2. enabled + missing secret → HARD ERROR
   *   3. disabled / pending row OR no row at all → HARD ERROR
   * (cases 3+5 from spec 0057's table merge into "no enabled row → throw"; cases 4+6 merge with that.)
   */
  export function resolveSlackCredentials(
    deps: SlackCredentialsResolverDeps,
  ): ResolvedSlackCredentials {
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
      const msg =
        'Slack channel installed but credentials missing — fix via dashboard or uninstall';
      logger.error({ event: 'slack_creds_empty_after_install', connectorId: slack.id }, msg);
      throw new Error(msg);
    }

    logger.info(
      { event: 'slack_creds_resolved', connectorId: slack.id },
      'Slack creds resolved from DB',
    );
    return { appToken, botToken };
  }
  ```

### Task H.3 — Update `resolve-credentials.test.ts`

- [ ] **H.3.1** Open `apps/worker/tests/channels/slack/resolve-credentials.test.ts`. Drop tests for cases 3 (disabled+env→fallback), 4 (disabled+missing→error), 5 (no row+env→fallback), 6 (no row+missing→error). Keep cases 1 (enabled+secrets→creds) and 2 (enabled+missing→error). Add 1 new test for "disabled row → throws not_installed" and 1 for "no row at all → throws not_installed".

- [ ] **H.3.2** Drop assertions on the `source` field (no longer in the return type).

- [ ] **H.3.3** Update the `SlackCredentialsResolverDeps` test fixture builder to drop the `env` field — only `connectors` + `logger` remain.

- [ ] **H.3.4** Run resolver tests:
  ```bash
  cd /Users/operator/www/octocat/zeno-agent-worktrees/2026-04-29-fn-cutover-channel
  pnpm --filter @zeno/worker test resolve-credentials
  ```
  Expected: 4 tests pass (was 6 in PR #22).

### Task H.4 — Update `boot-integration.test.ts`

- [ ] **H.4.1** Open `apps/worker/tests/channels/slack/boot-integration.test.ts`. Drop the `falls back to .env tokens when no DB row exists` test (line range varies; grep for `env_fallback` to find it).

- [ ] **H.4.2** Run:
  ```bash
  pnpm --filter @zeno/worker test boot-integration
  ```
  Expected: 1 test passes (was 2 in PR #22).

### Task H.5 — Simplify `config.ts`

- [ ] **H.5.1** Open `apps/worker/src/config.ts`. Remove `SLACK_APP_TOKEN` and `SLACK_BOT_TOKEN` from the Zod schema (PR #22 made them optional; now they go away entirely).

- [ ] **H.5.2** Remove the `slack: { appToken: ... }` field from the `Config` type.

- [ ] **H.5.3** Remove the corresponding entries in `loadConfig()` return object.

### Task H.6 — Update `config.test.ts`

- [ ] **H.6.1** Identify SLACK-related tests by grep:
  ```bash
  grep -nE 'SLACK_APP_TOKEN|SLACK_BOT_TOKEN|cfg\.slack' apps/worker/tests/config.test.ts
  ```

- [ ] **H.6.2** Triage:
  - Pre-PR-#22 tests asserting `loadConfig()` THROWS on missing/malformed SLACK → DROP.
  - PR-#22-added tests asserting SLACK is OPTIONAL → DROP.
  - The `loads valid config` happy-path test, if it asserts on `cfg.slack.appToken` → REMOVE the assertion or drop the whole test if it now does nothing else useful.

- [ ] **H.6.3** **DO NOT TOUCH** non-SLACK envvar tests (e.g. `CLAUDE_CODE_OAUTH_TOKEN`).

- [ ] **H.6.4** Run:
  ```bash
  pnpm --filter @zeno/worker test config
  ```
  Expected: green; total tests in this file dropped from 4 to 1-2.

### Task H.7 — Update `index.ts`

- [ ] **H.7.1** Find the `resolveSlackCredentials` call site:
  ```bash
  grep -n 'resolveSlackCredentials' apps/worker/src/index.ts
  ```

- [ ] **H.7.2** Drop `env: config.slack` from the call:
  ```ts
  // Before: const slackCreds = resolveSlackCredentials({ connectors, env: config.slack, logger });
  // After:
  const slackCreds = resolveSlackCredentials({ connectors, logger });
  ```

- [ ] **H.7.3** TypeScript check:
  ```bash
  pnpm --filter @zeno/worker typecheck
  ```
  Expected: green.

### Task H.8 — Errata note in spec 0057

- [ ] **H.8.1** Append to `context/specs/2026-04-29-slack-channel/spec.md` (just after the frontmatter or at the end of "Open Questions"):

  ```markdown
  ## Errata (post-merge)

  **2026-MM-DD (spec 0058 cutover):** the 6-row resolution table described in Track 3 has been
  simplified to 4 rows. Cases 3, 4, 5, 6 (env_fallback paths) were removed when `profiles/fn`
  cut over to DB-only credentials and the `.env` fallback code became unreachable. See
  spec 0058 Phase H for the simplification.
  ```

  Replace `2026-MM-DD` with the actual cutover date.

### Task H.9 — Quality gate

- [ ] **H.9.1** Run full quality gate:
  ```bash
  pnpm run quality-gate
  ```
  Expected: 30/30 turbo tasks green. Test count drops from PR #22's 585 to ~580 (4-5 deletions).

### Task H.10 — Learning note

- [ ] **H.10.1** Create `context/learnings/<date>-channel-as-connector-cutover.md` documenting:
  - The "channels share storage with MCP via discriminator" pattern from PR #22 worked end-to-end.
  - The 6-row → 4-row resolution table simplification.
  - Operational gotchas observed during cutover (heads-up timing, polling for async install, cold-boot vs restart).
  - Wikilinks to spec 0057 and spec 0058.

### Task H.11 — Commit Phase H + spec-0058 docs

- [ ] **H.11.1** Stage + commit:
  ```bash
  git add apps/worker/src/channels/slack/resolve-credentials.ts \
          apps/worker/tests/channels/slack/resolve-credentials.test.ts \
          apps/worker/tests/channels/slack/boot-integration.test.ts \
          apps/worker/src/config.ts \
          apps/worker/tests/config.test.ts \
          apps/worker/src/index.ts \
          context/specs/2026-04-29-slack-channel/spec.md \
          context/specs/2026-04-29-fn-cutover-channel/spec.md \
          context/specs/2026-04-29-fn-cutover-channel/plan.md \
          context/specs/2026-04-29-fn-cutover-channel/tasks.md \
          context/learnings/<date>-channel-as-connector-cutover.md
  git commit -m "feat(worker): drop .env Slack fallback, simplify resolver to 4 cases (spec 0058)"
  ```

---

## Phase I — 3-round branch review

Per cleanup contract Rule 2: each round is a fresh subagent with no prior-review context. Reset on any blocking finding.

- [ ] **I.1 R1** — dispatch review of branch state (docs + Phase H diff). Fix any blocking finding; reset to R1.
- [ ] **I.2 R2** — fresh review. Reset on blocking.
- [ ] **I.3 R3** — fresh review. Clean → proceed.

---

## Phase J — Push + open PR

- [ ] **J.1.1** Push:
  ```bash
  git push -u origin feat/spec-2026-04-29-fn-cutover-channel
  ```

- [ ] **J.1.2** Open PR via `/open-pr` skill targeting `main`. PR description summarizes:
  - The cutover narrative (Phases A-G executed; profile fn now on DB-only).
  - Phase H code changes (resolver simplification, config cleanup, test deletions).
  - Test count delta (~585 → ~580).
  - Single-commit diff structure.

- [ ] **J.1.3** Return PR URL. STOP — done.

---

## Done criteria

- [ ] All Phases A-J complete.
- [ ] `profiles/fn` running with `slack_creds_source: 'connector_secrets'` (logged per recent boot).
- [ ] `profiles/fn/.env` no longer contains `SLACK_*_TOKEN`.
- [ ] Phase H code commit landed on the branch.
- [ ] R1+R2+R3 reviews CLEAN consecutive.
- [ ] PR open against main, mergeable.
