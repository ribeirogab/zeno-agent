---
status: draft
feature: agent-profile-split
created: 2026-04-21
shipped: null
---
# Agent / Profile Split — Spec

**Status:** Draft
**Scope:** Separate Zeno's own identity (SOUL.md, built-in skills, built-in MCPs) from the user's personal configuration (USER.md, personal skills, config, personal MCPs), and unify crons into a broader `config.yaml`.

## Context

Zeno's positioning was recently reframed as a skills-first agent (branch `refactor/skills-first-positioning`, commits `8646b70` and `7fa129f`): the core stays small, capabilities live in skills. With that in place, the layout of `profile/` became awkward: it mixes files that *are* Zeno (SOUL.md, built-in skills like `dev-workflow` and `cron-management`) with files that belong to the user (USER.md, personal skills, tokens). The gitignore has to carry per-skill exceptions to handle this split implicitly.

This spec formalizes the split: `agent/` holds the Zeno, `profile/` holds the user. At the same time, `profile/crons.yaml` becomes `profile/config.yaml` to make room for future user-level config without fragmenting into many small files. A built-in Playwright skill (plus its MCP server) is added as part of this pass, since it is the first concrete case that exercises the agent-level MCP layer.

## Problem Statement

Three problems today, one change fixes them all:

1. **Mixed ownership in `profile/`.** SOUL.md is Zeno's identity but lives under `profile/`, which is semantically the user. Built-in skills (`dev-workflow`, `cron-management`) need gitignore exceptions to be committed alongside user skills that stay gitignored. This is confusing and brittle.
2. **Config fragmentation.** `crons.yaml` is a single-purpose file. Any future config (log retention, approval patterns, dashboard preferences) would add another top-level file. Better to have one `config.yaml` that grows by section.
3. **No place for built-in MCPs.** Adding a Playwright skill requires its MCP server. Today all MCPs live in `profile/mcp.json` (user-owned, with tokens). There is no natural place for MCPs that ship with Zeno and have no secrets (Playwright, future built-ins).

## Non-Goals

- **No multi-agent changes.** This is strictly about the internal layout of the Zeno repo. Zunix-level structure is out of scope.
- **No runtime behavior changes beyond the split.** Skill invocation, cron execution, MCP interpolation, hot-reload: all preserved exactly as they work today.
- **No migration guide for external users.** Zeno is single-user; the maintainer updates his own install as a one-shot move.
- **No new user-facing features in the dashboard or Slack.** This is infrastructure.
- **No change to the `settingSources: ['user']` wiring** in the Claude Agent SDK backend. Skills still merge via symlinks into `~/.claude/skills/`.

## Constraints

- **Docker bind-mounts do not merge.** Two bind-mounts into `~/.claude/skills/` is not supported by Docker; one replaces the other. Merging must happen at the container level, not the mount level.
- **Hot-reload of SOUL.md, USER.md, config.yaml must continue working.** The profile watcher already covers this today; after the split it watches both `agent/` and `profile/`.
- **No secrets in committed files.** `agent/mcp.json` can only contain MCP servers that work without user-provided tokens (Playwright qualifies; Linear / Notion do not).
- **User is single.** No backwards-compatibility shim needed; the maintainer moves files in one commit.

## Target Layout

```
agent/                         # committed — Zeno's identity
├── SOUL.md
├── mcp.json                   # built-in MCP servers (no secrets)
└── skills/
    ├── dev-workflow/
    ├── cron-management/
    └── playwright/            # new

profile/                       # gitignored except listed exceptions
├── USER.md
├── USER.example.md            # committed
├── config.yaml                # { crons: [...], ...future sections }
├── config.example.yaml        # committed
├── mcp.json                   # user MCPs (with tokens)
├── mcp.example.json           # committed
└── skills/
    ├── .gitkeep               # committed
    └── <user-authored>/
```

`.gitignore`:

```
profile/*
!profile/USER.example.md
!profile/config.example.yaml
!profile/mcp.example.json
!profile/skills/
profile/skills/*
!profile/skills/.gitkeep
```

## Config File Shape

`config.yaml` starts with a single section; new sections are added when a concrete need arises, never preemptively. Each cron entry preserves the exact shape validated by the existing Zod schema in `apps/worker/src/cron/static-loader.ts` — `notify` is a nested object, not two flat fields.

```yaml
crons:
  - name: daily-standup
    description: optional free-text description
    schedule: "0 9 * * 1-5"
    prompt: "..."
    notify:
      conversation_id: "C0ABCDE1234"
      thread_id: null
```

`config.example.yaml` ships with an empty `crons: []` and a comment showing one fully-populated entry as a reference.

The `StaticCronFileSchema` (same zod schema as today) validates the top-level `crons:` array. Other top-level keys are silently accepted (not rejected) so future sections can be introduced without breaking older loader code paths; unknown keys log `config_unknown_section` at warn level.

The `createdBy` column written to the database for each static cron changes from `'profile/crons.yaml'` to `'profile/config.yaml'` to stay accurate.

## Skill and MCP Merging

### Skills

Skills from both `agent/skills/` and `profile/skills/` must be visible to the Claude Agent SDK under `~/.claude/skills/`. Docker cannot merge two bind-mounts into that path, so:

1. **Remove** the current `./profile/skills:/home/node/.claude/skills:ro` mount from `infra/docker-compose.yml`.
2. Bind-mount `./agent` → `/app/agent:ro` (new).
3. Bind-mount `./profile` → `/app/profile:ro` (already exists).
4. An entrypoint script creates symlinks in `/home/node/.claude/skills/`, one per skill directory under each source.

The entrypoint script runs before the Node process starts. For each directory under `/app/agent/skills/` and `/app/profile/skills/`, it creates a symlink at `/home/node/.claude/skills/<skill-name>` pointing to the skill directory. `profile/skills/<name>` is processed last so a matching name overwrites the `agent/` symlink. Each `profile/` override logs `skill_override` to stderr so the behavior is visible.

Hot-reload of file *edits* still works because symlinks resolve live against the bind-mounted source. Adding a *new* skill directory requires a container restart; this is acceptable because skills are rarely added on the fly.

### MCPs

`apps/worker/src/agent/mcp.ts` reads both files on boot:

1. Load `agent/mcp.json` (built-in servers).
2. Load `profile/mcp.json` (user servers).
3. Apply the existing env-var interpolation logic to entries from both files. Any entry with an unresolved env var is skipped and logged `mcp_server_skipped` (identical to today's behavior).
4. Merge the resolved maps: if a server name exists in both, the entry from `profile/` wins.
5. Pass the merged map to the Claude Agent SDK as `mcpServers`.

Built-in MCPs in `agent/mcp.json` normally do not reference env vars (Playwright has none). If a future built-in server does, it follows the same skip-on-missing-env rule as user MCPs — no special-case code path.

## Code changes summary

| File | Change |
|---|---|
| `apps/worker/src/agent/system-prompt.ts` | `loadProfileFile` splits into `loadAgentFile` (reads from `/app/agent` or `agent`) and `loadProfileFile` (reads from `/app/profile` or `profile`). `buildSystemPrompt` sources SOUL from agent, USER from profile. |
| `apps/worker/src/cron/static-loader.ts` | Rename target from `crons.yaml` to `config.yaml`. Top-level schema wraps `StaticCronFileSchema` in a permissive parent (unknown keys allowed). `createdBy` string updated. `PROFILE_CANDIDATES` stays profile-only. |
| `apps/worker/src/profile/watcher.ts` | Watches **both** `/app/agent` and `/app/profile` (two `fs.watch` calls, same debounce/dispatch logic). `classify()` keyed on a `{source, filename}` pair — `SOUL.md` recognized only when source is agent; `USER.md`, `config.yaml`, `mcp.json` recognized only when source is profile. `skills/` under either source stays ignored. |
| `apps/worker/src/agent/mcp.ts` | Adds an `AGENT_CANDIDATES` (mirror of `PROFILE_CANDIDATES`). Loads `agent/mcp.json` and `profile/mcp.json`, runs each through the existing interpolation and skip logic, then merges with profile-wins. |
| `apps/worker/src/agent/backends/claude-code.ts` | No change. `settingSources: ['user']` stays. |
| `infra/docker-compose.yml` | Remove the `./profile/skills:/home/node/.claude/skills:ro` mount. Add `./agent:/app/agent:ro`. Keep `./profile:/app/profile:ro`. |
| `infra/Dockerfile` | Ship an entrypoint script (e.g., `infra/entrypoint.sh`) that creates the skill symlinks before invoking the Node process. Fail-fast if `/app/agent/skills/` or `/app/profile/skills/` is missing. |
| `.gitignore` | Replace the old `profile/skills/*` + `!profile/skills/dev-workflow/` etc. exceptions with the new layout shown under *Target Layout*. |
| README.md | Update setup instructions: three `cp *.example.*` commands. Document the `profile-wins` override rule. |

## Playwright Skill

Ships in `agent/skills/playwright/SKILL.md`. The skill describes the tool cheatsheet for the `playwright` MCP server and encodes the screenshot-path convention (`.playwright-mcp/` prefix).

`agent/mcp.json` contains the `playwright` entry so the skill works out-of-the-box without any user setup.

The existing global-memory note about `.playwright-mcp/` prefix moves into the skill body (the skill is the right place for that rule; memory persists across projects and shouldn't hold project-specific conventions).

## User Stories

1. **Fresh clone.** I clone the repo, run the setup steps from README (`cp` the three `*.example.*` files), set my tokens in `.env`, `docker:up`. The `agent/` side is ready as-is; the `profile/` side is mine to customize.
2. **Authoring a new personal skill.** I create `profile/skills/acme/SKILL.md` with whatever auxiliary files I want, including credentials. Nothing gets committed by accident; everything inside `profile/skills/` is gitignored except `.gitkeep`.
3. **Overriding a built-in skill.** I create `profile/skills/dev-workflow/SKILL.md` with my own variant. My version wins over the built-in one without any code change.
4. **Adding a built-in capability to Zeno.** I contribute a new skill to `agent/skills/` and, if it needs an MCP, add the server to `agent/mcp.json`. Other Zeno instances (if I ever run Zeno elsewhere) pick it up on next pull.
5. **Editing SOUL.md to refine Zeno's persona.** I edit `agent/SOUL.md` and see the change take effect without restart (hot-reload preserved).

## Success Criteria

1. `agent/` contains `SOUL.md`, `mcp.json`, and three skill directories (`dev-workflow`, `cron-management`, `playwright`), all committed.
2. `profile/` is gitignored except `USER.example.md`, `config.example.yaml`, `mcp.example.json`, and `skills/.gitkeep`.
3. `pnpm run docker:up` produces an `zeno_online` log with no errors introduced by this change.
4. `docker exec zeno-agent ls /home/node/.claude/skills/` shows `dev-workflow`, `cron-management`, `playwright` (and any user skills if present).
5. Smoke check (optional, requires the `claude` CLI inside the container — installed today via the Dockerfile): `docker exec zeno-agent claude --print --setting-sources user "list the names of your skills"` returns all skill names including `playwright`.
6. Editing `agent/SOUL.md` triggers the profile watcher's `prompt` group and re-renders the system prompt (same debounce behavior as today's `profile/SOUL.md` edit). Same for `profile/USER.md` → `prompt` group, `profile/config.yaml` → `crons` group, `profile/mcp.json` → `mcp` group.
7. A cron defined in `profile/config.yaml` under `crons:` is loaded at boot (`cron_static_loaded` shows non-zero count when an entry exists).
8. `pnpm run quality-gate` passes.
9. Existing MCP servers (`playwright` from built-in, plus any user MCPs with resolved env vars) appear in `mcp_server_enabled` logs.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Existing `./profile/skills:/home/node/.claude/skills:ro` mount left in place by accident during implementation, shadowing the entrypoint-managed directory | The code-changes table explicitly lists this mount for removal. Success Criterion #4 (`docker exec … ls`) catches the regression because agent skills would be invisible. |
| Entrypoint symlink script fails silently, skills invisible at runtime | Fail-fast: if `agent/skills/` or `profile/skills/` missing, log `skills_bootstrap_failed` and exit non-zero. Covered in boot smoke test. |
| Watcher edits miss the `agent/` side because `PROFILE_CANDIDATES` was not extended | The code-changes table calls out the dual-source watcher explicitly. Unit test in `watcher.test.ts` exercises both sources. |
| User has an old `profile/SOUL.md` or `profile/crons.yaml` after pulling the change | One-shot move done on the same branch by the maintainer; no external users to notify. README setup instructions updated. |
| `profile/config.yaml` schema drift when future sections arrive | Zod schema in `static-loader.ts` validates the file; unknown top-level keys log a warning (non-fatal) so future sections can be introduced without breaking older loaders. |
| Playwright MCP server download on first boot is slow | Pre-existing concern (already happens today with the user-configured Playwright entry). No regression. |
| Name collision between built-in and user skill is surprising | Document the "profile wins" rule in README. Log `skill_override` when a symlink from `profile/` replaces one from `agent/` during entrypoint. |
| Hot-reload of a skill directory's *contents* works but adding a *new* skill requires restart | Documented as an acceptable limitation in SOUL.md / README. Skills are not created under time pressure. |

## Open Questions

None. All scoping questions resolved during brainstorming:

- Top-level dir name: `agent/`
- Config scope: only crons for now; future sections added as needed, not preemptively
- MCP stays separate from `config.yaml` (has its own structured shape)
- Playwright is the first built-in MCP; lives in `agent/mcp.json`
- Entrypoint symlinks are the merge strategy (Docker bind-mount limitation)
