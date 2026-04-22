---
feature: guardrails-approval
spec: "[[spec]]"
created: 2026-04-22
status: pending-validation
---
# Guardrails — pending manual smoke checks

Spec 0023 was implemented and shipped on PR #5. The phases below were
fully exercised by automated tests + a real Haiku call + a real container
boot. The checks listed here require human-in-loop interaction with a
running Slack workspace and could not be done from the implementation
session.

Run these before relying on guardrails for a real "worker mode" scenario
(e.g. before plugging Zeno into a company Slack with non-owner users).

## Pre-requisites (one-time)

- [ ] Reimport `infra/slack-app-manifest.json` into the Slack App config
      at https://api.slack.com/apps/<APP_ID>/app-manifest. The new
      scopes (`im:write`, `reactions:read`) and event (`reaction_added`)
      will not auto-apply on existing installs.
- [ ] Reinstall the app to the workspace so the new scopes take effect.
- [ ] Add an `approvals:` section to `profiles/<name>/config.yaml` —
      template at `profiles/default/config.example.yaml`. Set
      `owner_slack_user_id` to your real Slack user id.
- [ ] `pnpm run docker:down && pnpm run docker:build && pnpm run docker:up`
      and confirm logs show `guardrails_enabled` with the expected
      `ownerUserId`/`alwaysSensitive`/`timeoutSec`.

## Smoke 1 — owner-mode auto-allow (read-only path)

- [ ] In Slack, mention `@zeno read the README` (or any other obviously
      read-only ask). Expected:
  - No approval prompt appears.
  - Zeno replies with the file content.
  - `approvals_log` has a row with `policy_that_gated = 'auto_allow'`,
    `decision = 'allow'`.

## Smoke 2 — owner-mode classifier sensitive

- [ ] Mention `@zeno write a hello-world to /workspace/scratch.txt`.
      Expected:
  - Zeno posts in the same thread: *"Can I run `Write` ... 👍 aprova /
    👎 nega"* with the classifier reason.
  - React 👍 → file gets written, Zeno proceeds.
  - `approvals_log` row: `policy_that_gated = 'classifier'`,
    `decider_user_id = <your id>`, `decision = 'allow'`.

## Smoke 3 — always_sensitive override

- [ ] Add `Bash` to `always_sensitive` (or pick a tool you actually use)
      and restart the container.
- [ ] Trigger that tool. Expected:
  - Approval prompt appears WITHOUT a classifier call (verify by absence
    of any classifier latency in logs / no Haiku turn fired).
  - 👎 → action cancelled, Zeno responds *"ação cancelada"*.
  - `approvals_log` row: `policy_that_gated = 'always_sensitive'`,
    `decision = 'deny'`.

## Smoke 4 — timeout

- [ ] Trigger a sensitive action. DO NOT react.
- [ ] After `approval_timeout_sec` (default 300s; lower it to ~30s in
      config for the test), Zeno should:
  - Post *"ação cancelada (sem resposta em 5min)"* (timing reflects the
    configured timeout).
  - `approvals_log`: `policy_that_gated = 'timeout'`, `decision =
    'deny'`, `decider_user_id = NULL`.

## Smoke 5 — worker-mode DM routing

- [ ] Have a second Slack account (or a colleague) mention `@zeno do
      something sensitive` in a channel where the bot is invited.
- [ ] Expected on the requester side: Zeno posts *"aguardando aprovação
      do owner..."* in the original thread.
- [ ] Expected in YOUR DM with the bot: an approval prompt with
      requester mention + thread link + tool details. React 👍.
- [ ] Expected back in the original channel thread: Zeno proceeds with
      the action and responds to the requester.
- [ ] `approvals_log` row: `requester_user_id = <other user>`,
      `decider_user_id = <you>`.

## Smoke 6 — DM-open failure (negative path)

- [ ] Temporarily set `owner_slack_user_id` to a user the bot has never
      DM'd AND make sure the bot lacks `im:write` (e.g. on a stale install
      that was not reinstalled after the manifest change).
- [ ] Worker-mode trigger from any non-owner.
- [ ] Expected: fail-safe deny in the original thread with reason
      `approver_channel_error: ...`. `approvals_log` row reflects the
      same.

## Smoke 7 — read_only skill bypass

- [ ] Confirm `agent/skills/<some-skill>/SKILL.md` has `read_only: true`
      in frontmatter (or add it to a real read-only skill like
      `acme`).
- [ ] Trigger a tool from that skill.
- [ ] Expected: no classifier call (low latency), no approval prompt.
      `approvals_log`: `policy_that_gated = 'read_only'`.

## Smoke 8 — race / cleanup

- [ ] Trigger 2 sensitive actions in different threads simultaneously
      (open two threads, mention the bot in both within ~1s). React on
      both within timeout.
- [ ] Both should resolve independently. Listeners must not leak (no
      growing memory; check `docker stats` over 5 min during repeated
      tests).

---

## What was already covered (do NOT re-test manually)

- ✅ Migration applies cleanly on top of an existing 1-3 DB
  (verified against a snapshot of `zeno-fn_workspace-fn`).
- ✅ Disabled-mode boot (no `approvals:` section) → `guardrails_disabled`
  warning, container otherwise boots normally.
- ✅ Enabled-mode boot wires `GuardedBackend` + `HaikuClassifier` +
  `SlackApprover` + audit pipeline without crashing.
- ✅ Real Haiku classification on 4 representative inputs:
  Read/git-log → safe; `rm -rf`/merge_pull_request → sensitive.
  Latency 4-9s. Bug found and fixed: prompt + tolerant parser
  (commit `8e39ef7`).
- ✅ All 146 worker unit + integration tests + 69 api tests passing.

## How to record results

After each smoke check, drop a row in `tmp/0023-smoke-<date>.md` with
the timestamp, the action, the observed behavior, and the
`approvals_log` row id you can grep for. If a smoke fails, open an
issue referencing this file and the failing scenario number.
