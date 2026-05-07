# Profile Templates

Read-only blueprints used by `zeno profile create` to scaffold a new profile under `~/.zeno/profiles/<name>/`.

- `USER.md` — identity + preferences template. Placeholders `<your-name>` and `<auto-detected-tz>` are substituted by the CLI on `profile create`. Other placeholders (`<your-github-username>`, `<your-slack-user-id>`) survive verbatim and are operator-edited later.
- `env.template` — env vars template. The CLI generates `ZENO_MASTER_KEY` and writes the result to `~/.zeno/profiles/<name>/.env`. Operator edits `DASHBOARD_PASSWORD` and `DASHBOARD_SESSION_SECRET` themselves before first `zeno start`.

**These files are never edited per-instance.** They are the canonical source the CLI reads from. Editing them changes the scaffold for every future `zeno profile create`. Operator-facing edits live under `~/.zeno/profiles/<profile>/`, not here.
