---
feature: dashboard-kebab-case
spec: "[[spec]]"
created: 2026-04-16
---
# Dashboard Kebab-Case Rename — Plan

**For this spec:** `[[spec]]`

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` (small focused plan, 3 tasks, single app). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Rename 24 PascalCase component files under `apps/dashboard/src/components/**` to kebab-case, update every import, and codify the file-naming rule in `context/conventions/code-style.md`.

**Architecture:** Pure refactor. No runtime behavior changes. One disposable shell script under `tmp/` handles the two-step `git mv` (macOS case-insensitive FS workaround) and the sed pass on import specifiers. A single follow-up commit updates the convention doc. Quality gate proves equivalence.

**Tech Stack:** Bash, `git mv`, `sed`, Biome, TypeScript, pnpm/turbo quality-gate.

## Approach

Three tasks, one commit per task, one branch.

1. **Rename + import update** — write `tmp/rename-kebab.sh`, run it, let Biome reorganize imports, verify quality-gate passes. One commit.
2. **Convention doc** — append File naming section to `context/conventions/code-style.md`. One commit.
3. **Smoke via Docker** — rebuild the container image, boot, walk every route, confirm no 500. Push, no PR merge (user reviews).

Script is disposable — deleted with `rm -rf tmp/rename-kebab.sh` after the refactor lands (or left under `tmp/` which is gitignored).

## File Structure

### Rename pairs (24)

All under `apps/dashboard/src/components/`:

| Old | New |
|---|---|
| `crons/CronActions.tsx` | `crons/cron-actions.tsx` |
| `crons/CronForm.tsx` | `crons/cron-form.tsx` |
| `crons/CronRow.tsx` | `crons/cron-row.tsx` |
| `crons/CronRunHistoryRow.tsx` | `crons/cron-run-history-row.tsx` |
| `crons/CronStatusPill.tsx` | `crons/cron-status-pill.tsx` |
| `home/ActivityRow.tsx` | `home/activity-row.tsx` |
| `home/StatTile.tsx` | `home/stat-tile.tsx` |
| `layout/Layout.tsx` | `layout/layout.tsx` |
| `layout/Sidebar.tsx` | `layout/sidebar.tsx` |
| `logs/FollowingToggle.tsx` | `logs/following-toggle.tsx` |
| `logs/LevelChips.tsx` | `logs/level-chips.tsx` |
| `logs/LogJsonBlock.tsx` | `logs/log-json-block.tsx` |
| `logs/LogRow.tsx` | `logs/log-row.tsx` |
| `logs/LogSearchInput.tsx` | `logs/log-search-input.tsx` |
| `logs/TimeRangeSelect.tsx` | `logs/time-range-select.tsx` |
| `sessions/MessageBlock.tsx` | `sessions/message-block.tsx` |
| `sessions/SessionRow.tsx` | `sessions/session-row.tsx` |
| `settings/McpServerRow.tsx` | `settings/mcp-server-row.tsx` |
| `settings/ProfileFileRow.tsx` | `settings/profile-file-row.tsx` |
| `settings/RestartDialog.tsx` | `settings/restart-dialog.tsx` |
| `settings/ServiceStatus.tsx` | `settings/service-status.tsx` |

### EDIT

| File | Change |
|---|---|
| `context/conventions/code-style.md` | Append **File naming** section with examples + macOS gotcha |

### NEW (disposable)

| File | Purpose |
|---|---|
| `tmp/rename-kebab.sh` | One-shot rename + sed script |

## Phase Ordering

No phases — linear. Rename → docs → smoke.

## Risks / Open Decisions

- **macOS case-insensitive FS.** Mitigated by the two-step intermediate name in the script. Without it, `git mv` is a no-op.
- **sed on BSD vs GNU.** Script uses `sed -i ''` (BSD default on macOS). Script is developer-only, not CI.
- **Missed import from a barrel.** Dashboard has no `components/**/index.ts` barrels today (verified). Typecheck catches the rest.
- **Biome reorders imports** on lint — accepted, one-time noise in the diff.
