---
title: Crons folder — how it works
tags: [meta, reference]
---
# Crons folder

This folder is the source of truth for every cron in this profile. Each subfolder is one cron. The agent fires the `CRON.md` body on the schedule declared in its frontmatter.

> Docs: <https://docs.zeno-agent.dev/docs/crons>

## Layout

```
~/.zeno/profiles/<name>/crons/
├── _README.md        # this file
├── _template/        # blank scaffold (do not run; copy via `zeno cron create`)
└── <slug>/
    ├── CRON.md       # frontmatter + prompt
    └── scripts/      # optional aux files the agent reads via Bash
```

Folders prefixed with `_` are meta. Reserved slugs: `.disabled`, `.tmp`, `_template`. Slugs must match `^[a-z][a-z0-9-]*$` (lowercase, kebab-case, ≤ 63 chars).

## How the worker uses it

1. **Boot.** The worker bind-mounts `crons/` read-only at `/app/crons` inside the container.
2. **Poll.** Every 2 s the `CronManager` walks `crons/*/CRON.md`, parses frontmatter, re-schedules entries whose mtime or content hash advanced.
3. **Fire.** When a schedule hits, the agent runs with the CRON.md body as the user prompt and `/app/crons/<slug>/` as its working directory (Bash can `cat scripts/*`).

The worker never writes to this folder. All edits are yours.

## CRON.md frontmatter

| Key | Type | Required | What it does |
|---|---|---|---|
| `name` | string | yes | Human-readable name surfaced in dashboard + CLI. |
| `description` | string | no | One-line summary. |
| `schedule` | string | yes | Cron expression (UTC). Validate at [crontab.guru](https://crontab.guru). |
| `enabled` | boolean | yes | `false` skips firing without deleting the cron. |

Invalid `schedule` or missing required keys → the cron is registered as disabled in the dashboard with the parse error in `lastError`.

## Useful CLI commands

```
zeno cron list <profile>           # walk folder, join with runtime state
zeno cron show <slug> [profile]    # print parsed CRON.md
zeno cron create <slug> --schedule '<expr>' [--name '<text>']
zeno cron open [slug] [profile]    # open in OS file browser
zeno cron enable <slug>            # flip frontmatter enabled flag
zeno cron disable <slug>
zeno cron delete <slug> [--yes]
zeno cron test <slug>              # synchronous run, returns session id
```

## Privacy

Nothing in this folder is committed to the Zeno repository. Lives under `~/.zeno/profiles/<name>/` on your machine. Audit before committing to your own backup repo — prompts may reference secrets or internal context.
