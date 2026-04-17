---
status: shipped
feature: dashboard-kebab-case
created: 2026-04-16
shipped: 2026-04-17
---
# Dashboard Kebab-Case Rename — Spec

**Status:** Shipped
**Scope:** Rename every PascalCase component file under `apps/dashboard/src/components/**` to kebab-case, update imports, codify the file-naming rule in `context/conventions/code-style.md`. Component export names stay PascalCase; only filenames change.

## Context

Current dashboard has 24 files under `apps/dashboard/src/components/**` using PascalCase (e.g. `MessageBlock.tsx`, `CronActions.tsx`, `LogRow.tsx`), while the rest of the workspace already follows kebab-case: `routes/` (`crons.$id.tsx`, `sessions.index.tsx`), `lib/` (`use-logs.ts`, `api-client.ts`), primitives in `components/ui/` (`button.tsx`, `dialog.tsx`), and every worker/api/packages source file. The mismatch came from mid-flight shadcn-style copy where I kept the upstream filename convention for feature components without noticing the inconsistency.

This spec is the first in a chain of four refactors (A→B→C→D) that prepare the UI surface for real reuse:

- **A (this spec)** — normalize filenames.
- **B — spec 0016** — extract primitives to `@zeno/ui` package.
- **C — spec 0017** — build a full design system in Paper.
- **D — spec 0018** — replace native `window.confirm`/`alert` UX with shadcn primitives.

A must ship before B so the move to `packages/ui` doesn't bundle two concerns (rename + move) into one diff.

## Problem Statement

- File-system case-sensitivity drifts silently on macOS (case-insensitive FS) and crashes deploys on Linux containers when an import uses a different case than the file. We don't hit this yet but it's one typo away.
- The mix of `PascalCase.tsx` vs `kebab-case.tsx` in the same tree signals "no convention", which invites more drift with every new component.
- Biome doesn't lint filenames in this project (`useFilenamingConvention` is off), so the rule has to live in a written convention and be enforced by review for now.

## Non-Goals

1. **Moving files outside `apps/dashboard/src/components/`.** `lib/`, `routes/`, `ui/` are already kebab-case and out of scope. `styles/` is CSS.
2. **Renaming exports or components.** `export function MessageBlock()` stays PascalCase — that's the React standard.
3. **Enabling Biome's `useFilenamingConvention` rule.** Adding a linter pass would need tuning against legitimate exceptions (`__root.tsx`, TanStack splat files like `crons.$id.tsx`, generated `route-tree.gen.ts`). Out of scope; track as backlog if desired.
4. **Touching files outside `apps/dashboard/`.** Worker, api, packages are already consistent.
5. **Moving primitives to `@zeno/ui`.** That's Spec B (0016).

## Constraints

- **macOS filesystem is case-insensitive.** A plain `git mv MessageBlock.tsx message-block.tsx` is a no-op — git doesn't register the rename and both files effectively exist at once. Every rename must go through an intermediate name: `git mv X.tsx _X.tsx && git mv _X.tsx x.tsx`.
- **Imports must be updated in the same commit as the rename.** TanStack Router does not reference these feature components (it only reads `src/routes/`), but route files and components within `components/**` do import each other — a partial rename breaks typecheck.
- **No behavior change.** Quality-gate must pass pre- and post-refactor with identical test count.
- **No `any`, no `// biome-ignore`** in touched code (standing project rules).
- **Biome will reorder imports** on `pnpm run lint --write` as a side effect. Accept those as part of the commit.

## Design

### The 24 renames

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

### Execution

Single disposable script at `tmp/rename-kebab.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
DASH=apps/dashboard
declare -a pairs=(
  "$DASH/src/components/crons/CronActions.tsx:cron-actions.tsx"
  # ... all 24 pairs
)
for pair in "${pairs[@]}"; do
  old="${pair%%:*}"
  new_name="${pair##*:}"
  new="$(dirname "$old")/$new_name"
  tmp="$(dirname "$old")/_tmp_$(basename "$old")"
  git mv "$old" "$tmp"
  git mv "$tmp" "$new"
done
# Update imports across the dashboard
find "$DASH/src" -type f \( -name '*.ts' -o -name '*.tsx' \) -print0 \
  | xargs -0 sed -i '' \
    -e "s|/CronActions'|/cron-actions'|g" \
    -e "s|/CronForm'|/cron-form'|g" \
    # ... one substitution per renamed file (import paths only, no other occurrences)
```

After the script:

1. `pnpm run lint --write` to let Biome reorganize any displaced imports.
2. `pnpm run quality-gate` — typecheck catches any missed import; tests run unchanged; lint clean.
3. Visual smoke: `pnpm run docker:build && docker:up`, navigate to each of the 8 dashboard routes, confirm nothing 500s.

### Convention update

Append a **File naming** section to `context/conventions/code-style.md`:

```markdown
## File naming

All source files use **kebab-case** with the standard extension:

- Components: `message-block.tsx` (export `MessageBlock`)
- Hooks: `use-logs.ts` (export `useLogs`)
- Utilities: `api-client.ts`, `log-filters.ts`
- Routes (TanStack Router): kebab-case segments, dynamic params as `$param`, index as `.index` — e.g. `crons.$id.tsx`, `sessions.index.tsx`

Exceptions (do not rename):
- TanStack Router conventions: `__root.tsx`, `_authed.tsx`, generated `route-tree.gen.ts`
- Config files owned by tooling: `vite.config.ts`, `tailwind.config.ts`, etc.

**macOS gotcha.** Filesystem is case-insensitive by default; a direct `git mv Foo.tsx foo.tsx`
produces a no-op. Use an intermediate name: `git mv Foo.tsx _foo.tsx && git mv _foo.tsx foo.tsx`.
```

### Commit layout

One commit covering: 24 renames + import updates + convention doc update. A single logical change; splitting it would leave either renames without import fixes or doc without renames.

Commit subject: `refactor(dashboard): rename component files to kebab-case`
Body: bullet list of folders affected + pointer to the convention update.

## User Stories / Scenarios

1. **Developer adds a new feature component.** Reads `context/conventions/code-style.md`, sees the File naming section, creates `src/components/foo/foo-widget.tsx` with `export function FooWidget()`. No friction, no review comment needed.
2. **Developer renames a file in a future PR.** Remembers the macOS gotcha because the convention doc calls it out explicitly.
3. **Typecheck run after the merge.** Green. No broken imports.

## Success Criteria

1. No file under `apps/dashboard/src/components/**` contains an uppercase letter in its basename.
2. `pnpm run quality-gate` green — typecheck, lint, tests, build.
3. `pnpm run docker:build && pnpm run docker:up` boots; hitting each dashboard route (`/`, `/crons`, `/crons/new`, `/crons/$id`, `/sessions`, `/sessions/$threadId`, `/logs`, `/settings`, `/login`) returns HTTP 200 and renders the expected component tree.
4. `context/conventions/code-style.md` contains the **File naming** section with the macOS gotcha note.
5. Git log shows renames (not delete+add) for each file — i.e. `git log --follow` on the new path reaches the old file's history.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Direct `git mv` on macOS registers no rename; new + old coexist; import still resolves via case-insensitive FS; CI (Linux) then fails on the first import with wrong case | Mandatory intermediate-name two-step in the script. Reviewing the PR diff should show rename entries (R100) for all 24 files, not additions. |
| Missed import because of an unusual path shape (e.g. re-export through `index.ts`) | Dashboard currently has no `components/**/index.ts` barrel files; `grep -r "from .*/[A-Z]" apps/dashboard/src` after the run should return zero hits pointing to renamed files. |
| Sed substitution hits a non-import occurrence (string literal, comment) | Anchor substitutions on the trailing quote: `/CronActions'` → `/cron-actions'`. Import specifiers end with a quote; string literals using the same name without the path prefix are safe. |
| Biome reorders imports and bloats the diff | Accept it; one-time noise, single commit. The alternative (disabling the rule per-file) costs more. |
| Future developer forgets the rule and creates a new PascalCase file | Convention doc + review catch it. If it repeats, enable Biome's `useFilenamingConvention` (tracked separately). |

## Open Questions

None. Implementation-time decisions (captured in the plan commit):

- Whether to use `sed -i ''` (BSD, macOS) or `sed -i` (GNU). Script will be macOS-only since it runs on the developer machine; `sed -i ''` is fine. The script is disposable — it doesn't need to be portable.
- Whether `tmp/rename-kebab.sh` should be kept for the next refactor or deleted immediately after. Delete after; Spec B will have its own script with different needs.
