# Roadmap

This is the public roadmap for zeno-agent — a curated index of what is in flight, what is committed next, and what is on the radar without commitment. For each item the linked issue is the per-item conversation surface.

The maintainer also keeps a private scratch doc on local disk (`.vault/backlog.md`, gitignored) for raw ideas that have not yet hardened into commitments. Items move from the scratch doc into the issue tracker, and from the issue tracker into the relevant section below as they progress.

## Now (in flight)

_Nothing currently in flight._

## Next (committed, soon)

- [ ] [#58](https://github.com/ribeirogab/zeno-agent/issues/58) — feat(crons): manage scheduled tasks via CLI
- [ ] [#8](https://github.com/ribeirogab/zeno-agent/issues/8) — feat(agent): multi-backend toggle + Codex impl
- [ ] [#9](https://github.com/ribeirogab/zeno-agent/issues/9) — feat(channels): channel inbound files
- [ ] [#10](https://github.com/ribeirogab/zeno-agent/issues/10) — feat(channels): channel outbound files
- [ ] [#45](https://github.com/ribeirogab/zeno-agent/issues/45) — feat(security): production-grade auth layer for profile dashboards
- [ ] [#46](https://github.com/ribeirogab/zeno-agent/issues/46) — feat(dashboard): onboarding wizard inside profile dashboard
- [ ] [#47](https://github.com/ribeirogab/zeno-agent/issues/47) — feat(cli): backup / restore tooling for `~/.zeno/`
- [ ] [#76](https://github.com/ribeirogab/zeno-agent/issues/76) — feat(connectors): add AWS connector

## Later (no commitment)

- [ ] [#11](https://github.com/ribeirogab/zeno-agent/issues/11) — feat(channels): audio in / Slack voice transcription
- [ ] [#12](https://github.com/ribeirogab/zeno-agent/issues/12) — feat(channels): audio out / TTS reply

## Recently shipped

- [x] [#81](https://github.com/ribeirogab/zeno-agent/issues/81) — feat(connectors): add MySQL connector (read-only MCP) ([PR #84](https://github.com/ribeirogab/zeno-agent/pull/84))
- [x] [#75](https://github.com/ribeirogab/zeno-agent/issues/75) — feat(connectors): add Postgres connector (read-only MCP) ([PR #80](https://github.com/ribeirogab/zeno-agent/pull/80))
- [x] [#52](https://github.com/ribeirogab/zeno-agent/issues/52) — feat(install): drop pnpm host prereq via corepack bootstrap
- [x] [#57](https://github.com/ribeirogab/zeno-agent/issues/57) — feat(channels): manage channels via CLI + read-only `/channels` page + `ChannelManager` hot-reload ([PR #70](https://github.com/ribeirogab/zeno-agent/pull/70))
- [x] [#56](https://github.com/ribeirogab/zeno-agent/issues/56) — feat(backend): manage agent backend (Claude) only via CLI + dedicated dashboard menu + onboarding gate ([PR #68](https://github.com/ribeirogab/zeno-agent/pull/68))
- [x] [#60](https://github.com/ribeirogab/zeno-agent/issues/60) — feat(cli): UX overhaul — pickers, install.sh/upgrade parity, security fixes ([PR #62](https://github.com/ribeirogab/zeno-agent/pull/62))
- [x] [PR #54](https://github.com/ribeirogab/zeno-agent/pull/54) — feat(connectors): CLI-first rework — N instances per catalog, dashboard goes read-only, install/uninstall/test/refresh-tools/enable/disable all via `zeno connector …`
- [x] [#44](https://github.com/ribeirogab/zeno-agent/issues/44) — feat(db): unify DB stack as drizzle ([PR #53](https://github.com/ribeirogab/zeno-agent/pull/53))
- [x] [PR #32](https://github.com/ribeirogab/zeno-agent/pull/32) — feat(cli): interactive arrow-key picker on `zeno upgrade`
- [x] [PR #31](https://github.com/ribeirogab/zeno-agent/pull/31) — feat(dashboard): drop password gate, surface real version, reorder first-run checklist (Claude → Slack → cron)
- [x] [#17](https://github.com/ribeirogab/zeno-agent/issues/17) — feat(cli): multi-profile via CLI + kill `config.yaml` ([PR #18](https://github.com/ribeirogab/zeno-agent/pull/18)) plus follow-up fixes ([PR #20](https://github.com/ribeirogab/zeno-agent/pull/20) docker build CLI spawn, [PR #21](https://github.com/ribeirogab/zeno-agent/pull/21) worker boots without Slack, [PR #22](https://github.com/ribeirogab/zeno-agent/pull/22) install.sh at repo root, [PR #24](https://github.com/ribeirogab/zeno-agent/pull/24) docker build cwd)
- [x] [#7](https://github.com/ribeirogab/zeno-agent/issues/7) — feat(web): add apps/web landing page
- [x] [#6](https://github.com/ribeirogab/zeno-agent/issues/6) — feat(docs): add apps/docs minimal scaffold ([PR #19](https://github.com/ribeirogab/zeno-agent/pull/19))
- [x] [#5](https://github.com/ribeirogab/zeno-agent/issues/5) — feat(cli): add zeno CLI to replace daily docker compose ([PR #15](https://github.com/ribeirogab/zeno-agent/pull/15))
- [x] [#1](https://github.com/ribeirogab/zeno-agent/issues/1) — Track A: sanitization rule + final scrub + EN migration ([PR #1](https://github.com/ribeirogab/zeno-agent/pull/1))
- [x] [#2](https://github.com/ribeirogab/zeno-agent/issues/2) — Track B: license + community files ([PR #2](https://github.com/ribeirogab/zeno-agent/pull/2))
- [x] [#3](https://github.com/ribeirogab/zeno-agent/issues/3) — Track D: README rewrite for outsider ([PR #3](https://github.com/ribeirogab/zeno-agent/pull/3))
- [x] [#4](https://github.com/ribeirogab/zeno-agent/issues/4) — Track F: governance + release workflow ([PR #4](https://github.com/ribeirogab/zeno-agent/pull/4))
