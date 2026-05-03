---
created: 2026-04-29
specs: ["[[2026-04-29-slack-channel]]", "[[2026-04-29-fn-cutover-channel]]"]
tags: [architecture, channels, connectors, cutover, slack]
related:
  - "[[../specs/2026-04-29-slack-channel/spec-slack-channel]]"
---
# Channels as connectors — cutover pattern + observations

## What worked

- **Channels share storage with MCP connectors via a `kind` discriminator.** The `connectors` table grew one column (`kind: 'mcp' | 'channel'`) instead of getting a parallel `channels` table. CRUD endpoints (install, uninstall, list, secrets) reuse the existing `/api/connectors` flow. Net delta: 1 migration + 1 column + 1 catalog file + 1 listing endpoint. Vs. forking storage for channels would have meant ~3-4× the diff.
- **`.env` fallback bridge in spec 0057 + cutover in spec 0058 = two separate PRs.** The bridge let spec 0057 land WITHOUT touching `profiles/fn`, so the operator's daily Slack→Zeno workflow stayed unbroken during dev. The cutover then ran live as a separate maintenance window. This split was load-bearing — combining spec 0057 + 0058 into one PR would have either (a) blocked spec 0057's merge until cutover was ready, or (b) cut over `profiles/fn` from a not-yet-merged PR. Both worse.
- **6-row resolution table → 4-row simplification.** Spec 0057 needed all 6 cases (DB×{enabled, disabled, none} × env×{present, missing}) for backward compat. Spec 0058's cleanup commit dropped the env paths once unreachable. The `source` discriminator on the return type went away too — now there's only one source.
- **Cold restart (`docker:down` + `docker:up`), not `restart`.** Verified container env had no `SLACK_*_TOKEN` after Phase E by re-checking `docker exec ... env | grep SLACK_`. A `restart` keeps the same container process and might preserve in-memory env; `down`/`up` is the safe path for proving fresh boot.

## Operational gotchas observed during the cutover

1. **`POST /api/connectors` is async (command queue).** Channel install enqueued a `connector_create` command. `GET /api/channels` immediately after POST may return empty for ~1-3s while the worker processes. The spec's polling instruction (every 1s for 10s) handled this — found in attempt 1, but the polling loop is the right shape regardless.
2. **`GET /api/connectors/:id` returns the LEGACY hardcoded `kind: 'connector'` UI discriminator**, NOT the new DB `kind: 'mcp' | 'channel'`. The DB row IS correctly stored (verified via direct sqlite query during cutover), but the detail endpoint masks it. Spec 0058's Phase C.5 round-trip check was strict (expected `response.kind === 'channel'`); had to fall through to a direct DB query to confirm row state. Tracked as a future follow-up: detail endpoint should surface the DB `kind` separately from the UI `kind`.
3. **Sentry MCP cross-validation came for free during Tier 2.** The skill invocation (`fn-sentry-fix`) called `mcp__sentry__list_issues` etc. as part of its Phase 1-2 work. No separate smoke test needed for Sentry — the agent exercised it.
4. **Auto-resolve happy path during validation.** WORKER-D was already fixed upstream (commit `ab80a03c`, PR #100 merged 6min after last Sentry event). The skill detected this, marked the issue resolved without opening a PR, posted a clean structured Slack reply with `<@operator>` mention. Validates the auto-resolve flow shipped in spec 0055.
5. **Container env propagation works as expected.** `docker compose down`/`up` correctly picked up the edited `.env` (no SLACK tokens). Worker resolver then queried DB and resolved via `connector_secrets`. End-to-end transition was clean.

## Cutover playbook structure (for future channel migrations)

The 8-phase shape (A pre-flight → B heads-up → C install → D edit profile → E cold restart → F validate → G all-clear → H code cleanup) generalizes to any "credential moves from `.env` to DB" migration. Future channels (Telegram, WhatsApp) probably skip the cleanup phase since they'll never have an `.env` path — they install via dashboard from day one.

Key invariants:
- Backup `.env` BEFORE any edit (Phase A.5). Gitignored under `tmp/`.
- Verify the DB-write succeeded BEFORE editing the profile file (Phase C.4-5 → Phase D).
- Cold restart, never warm restart, when memory state matters.
- Two-tier validation (ping + real skill invocation) catches more than just "does the worker boot".

## Anti-patterns avoided

- Did NOT bundle the cutover playbook + code cleanup as separate PRs. The subagent counterpoint argued (correctly) that single-operator personal projects don't get follow-up cleanup PRs done — dead code rots. Burning the boats in the same PR was the right call.
- Did NOT add a "wait X days for stability before cleanup" buffer. With one operator + full observability, the buffer is illusory. If DB-only worked at the end of Phase F, it works.
- Did NOT remove the `.env` fallback code in spec 0057. Premature — `profiles/fn` was still on env; removing the fallback in 0057 would have crashed the running container at first restart.

## Linked specs

- Spec 0057 — Slack as channel connector (code) — landed via PR #22.
- Spec 0058 — Cutover playbook + final code cleanup — this PR.
