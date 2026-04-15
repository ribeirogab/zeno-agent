# Zeno — Smoke Test Checklist

Run this after any change that touches container setup, authentication, or the Slack/backend plumbing.

## Pre-flight

- [ ] `.env` has `SLACK_APP_TOKEN`, `SLACK_BOT_TOKEN`, `GH_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN` set
- [ ] `USER.md` exists at the repo root (copied from `USER.example.md` and filled in)
- [ ] Zeno bot has been invited to at least one Slack channel you test in
- [ ] `claude setup-token` has been run and the resulting token is pasted into `.env`

## Boot

- [ ] `docker compose up -d` starts without error
- [ ] `docker compose logs zeno-agent` shows `github_auth_ok`
- [ ] Logs show `claude_cli_ok` with a version string
- [ ] Logs show `claude_oauth_token_present`
- [ ] Logs show `user_md_loaded` with byte count
- [ ] Logs show `slack_connected` with a `botUserId`
- [ ] Logs show `zeno_online`

## Happy path (Spec S1)

- [ ] Mention `@zeno quais repos tem na octocat?` in a channel
- [ ] Eyes reaction appears on your message within ~2 seconds
- [ ] A reply lands in the same thread within ~30 seconds (warm-path target, not guarantee)
- [ ] Reply is in Portuguese (PT-BR)
- [ ] Reply lists repos correctly (cross-check with `gh repo list octocat` locally)
- [ ] Eyes reaction is removed and replaced with `:white_check_mark:`

## DM path (Spec S2)

- [ ] Send `oi` as a DM to the Zeno bot
- [ ] Reply arrives in the DM (not in a thread, `thread_ts` is null)
- [ ] Reply is in Portuguese

## Org without access (Spec S3)

- [ ] Mention `@zeno quais repos tem na SomeOrgYouCantSee?`
- [ ] Reply explains in plain language that there's no access
- [ ] Reply does not include raw stderr or mention the word `GH_TOKEN`

## Off-topic (Spec S4)

- [ ] Mention `@zeno qual a capital do Peru?`
- [ ] Reply: "Lima" (or equivalent), no tool call in logs (`backend_tool_call` absent)

## Auth expired simulation (Spec S5)

- [ ] In `.env`, set `CLAUDE_CODE_OAUTH_TOKEN` to an obviously-invalid value (e.g., `cct_bogus`)
- [ ] `docker compose up -d --force-recreate` so the SDK picks up the bad token
- [ ] Mention `@zeno oi`
- [ ] Reply instructs to run `docker compose run --rm zeno-agent claude setup-token`
- [ ] Logs show `handler_failed` with error kind `auth_expired`
- [ ] Restore: run `setup-token`, paste real token, `--force-recreate` again
