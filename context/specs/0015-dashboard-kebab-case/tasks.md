---
feature: dashboard-kebab-case
plan: "[[plan]]"
spec: "[[spec]]"
created: 2026-04-16
---
# Dashboard Kebab-Case Rename — Tasks

**For this plan:** `[[plan]]`

> **Conventions for every task:**
> - Absolute paths from project root.
> - Temp files under `tmp/` per `context/rules/generated-files-location.md`.
> - **Never use `any`. Never write `// biome-ignore`.** Refactor instead.
> - Each task ends with `git add <files> + git commit -m "..."`. English conventional commits, no AI attribution.
> - Tasks are independent; a fresh subagent can execute any one given only `tasks.md` + the spec + branch state.

---

## Phase 1 — Rename + imports

### Task 1.1: Write and run rename script

**Files:**
- Create: `tmp/rename-kebab.sh`
- Rename: 21 `.tsx` files under `apps/dashboard/src/components/` (see plan table)
- Modify: every `.ts`/`.tsx` file in `apps/dashboard/src/` that imports a renamed file

- [ ] **Step 1: Create a feature branch**

```bash
git checkout -b refactor/dashboard-kebab-case
```

- [ ] **Step 2: Write `tmp/rename-kebab.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

DASH=apps/dashboard
COMP="$DASH/src/components"

# pairs: "old_path:new_basename"
declare -a PAIRS=(
  "$COMP/crons/CronActions.tsx:cron-actions.tsx"
  "$COMP/crons/CronForm.tsx:cron-form.tsx"
  "$COMP/crons/CronRow.tsx:cron-row.tsx"
  "$COMP/crons/CronRunHistoryRow.tsx:cron-run-history-row.tsx"
  "$COMP/crons/CronStatusPill.tsx:cron-status-pill.tsx"
  "$COMP/home/ActivityRow.tsx:activity-row.tsx"
  "$COMP/home/StatTile.tsx:stat-tile.tsx"
  "$COMP/layout/Layout.tsx:layout.tsx"
  "$COMP/layout/Sidebar.tsx:sidebar.tsx"
  "$COMP/logs/FollowingToggle.tsx:following-toggle.tsx"
  "$COMP/logs/LevelChips.tsx:level-chips.tsx"
  "$COMP/logs/LogJsonBlock.tsx:log-json-block.tsx"
  "$COMP/logs/LogRow.tsx:log-row.tsx"
  "$COMP/logs/LogSearchInput.tsx:log-search-input.tsx"
  "$COMP/logs/TimeRangeSelect.tsx:time-range-select.tsx"
  "$COMP/sessions/MessageBlock.tsx:message-block.tsx"
  "$COMP/sessions/SessionRow.tsx:session-row.tsx"
  "$COMP/settings/McpServerRow.tsx:mcp-server-row.tsx"
  "$COMP/settings/ProfileFileRow.tsx:profile-file-row.tsx"
  "$COMP/settings/RestartDialog.tsx:restart-dialog.tsx"
  "$COMP/settings/ServiceStatus.tsx:service-status.tsx"
)

# sed expressions applied to every .ts / .tsx inside apps/dashboard/src
declare -a SED_EXPRS=(
  "s|/CronActions'|/cron-actions'|g"
  "s|/CronForm'|/cron-form'|g"
  "s|/CronRow'|/cron-row'|g"
  "s|/CronRunHistoryRow'|/cron-run-history-row'|g"
  "s|/CronStatusPill'|/cron-status-pill'|g"
  "s|/ActivityRow'|/activity-row'|g"
  "s|/StatTile'|/stat-tile'|g"
  "s|/Layout'|/layout'|g"
  "s|/Sidebar'|/sidebar'|g"
  "s|/FollowingToggle'|/following-toggle'|g"
  "s|/LevelChips'|/level-chips'|g"
  "s|/LogJsonBlock'|/log-json-block'|g"
  "s|/LogRow'|/log-row'|g"
  "s|/LogSearchInput'|/log-search-input'|g"
  "s|/TimeRangeSelect'|/time-range-select'|g"
  "s|/MessageBlock'|/message-block'|g"
  "s|/SessionRow'|/session-row'|g"
  "s|/McpServerRow'|/mcp-server-row'|g"
  "s|/ProfileFileRow'|/profile-file-row'|g"
  "s|/RestartDialog'|/restart-dialog'|g"
  "s|/ServiceStatus'|/service-status'|g"
)

echo "==> renaming ${#PAIRS[@]} files (two-step git mv to bypass macOS case-insensitive FS)"
for pair in "${PAIRS[@]}"; do
  old="${pair%%:*}"
  new_name="${pair##*:}"
  dir="$(dirname "$old")"
  new="$dir/$new_name"
  tmp="$dir/_tmp_$(basename "$old")"
  if [[ ! -f "$old" ]]; then
    echo "skip (missing): $old"
    continue
  fi
  git mv "$old" "$tmp"
  git mv "$tmp" "$new"
done

echo "==> rewriting imports"
mapfile -t files < <(find "$DASH/src" -type f \( -name '*.ts' -o -name '*.tsx' \))
for expr in "${SED_EXPRS[@]}"; do
  # shellcheck disable=SC2086
  sed -i '' -E -e "$expr" "${files[@]}"
done

echo "==> done"
```

- [ ] **Step 3: Run the script**

```bash
chmod +x tmp/rename-kebab.sh
./tmp/rename-kebab.sh
```

Expected output: 21 rename entries + "rewriting imports" + "done" and no errors. `git status` should show ~21 renames (as `R`) plus modified `.ts`/`.tsx` files where imports changed.

- [ ] **Step 4: Run Biome to reorganize imports**

```bash
cd apps/dashboard && pnpm lint --write
```

(If the script uses `biome check --write` or similar variant, adapt — the goal is `biome` auto-fix over the dashboard.)

Expected: Biome reorders any displaced imports, no unfixable issues.

- [ ] **Step 5: Typecheck**

```bash
cd apps/dashboard && pnpm typecheck
```

Expected: clean. If it fails with "cannot find module './XYZ'", the sed missed an import — inspect the failing line, add the needed regex to `SED_EXPRS`, re-run the script on a fresh copy (or fix the import by hand and note it for the next run).

- [ ] **Step 6: Verify no PascalCase filenames remain**

```bash
find apps/dashboard/src/components -type f | grep -E '/[A-Z]'
```

Expected: empty output.

- [ ] **Step 7: Verify no leftover PascalCase imports**

```bash
grep -rnE "from ['\"]\.+/[A-Z][a-zA-Z]+['\"]|from ['\"]@/components/[a-z]+/[A-Z]" apps/dashboard/src
```

Expected: empty output.

- [ ] **Step 8: Quality gate**

```bash
pnpm run quality-gate
```

Expected: green — lint + typecheck + tests + build across all workspaces.

- [ ] **Step 9: Commit**

```bash
git add apps/dashboard/
git commit -m "refactor(dashboard): rename component files to kebab-case"
```

---

## Phase 2 — Convention doc

### Task 2.1: Append File naming section

**Files:**
- Modify: `context/conventions/code-style.md`

- [ ] **Step 1: Append File naming section**

Open `context/conventions/code-style.md` and append **after the `**Examples:**` block** at the end of the file:

```markdown

## File naming

All source files use **kebab-case** basenames with the standard extension.

| Kind | Filename example | Exported name |
|---|---|---|
| React component | `message-block.tsx` | `MessageBlock` |
| React hook | `use-logs.ts` | `useLogs` |
| Utility / module | `api-client.ts`, `log-filters.ts` | `apiFetch`, `LogFilters` |
| Route (TanStack Router) | `crons.$id.tsx`, `sessions.index.tsx` | `Route` |
| Test | `logs.test.ts` | n/a |

**Exceptions — do not rename:**

- TanStack Router conventions: `__root.tsx`, `_authed.tsx`, the generated `route-tree.gen.ts`.
- Config files owned by tooling: `vite.config.ts`, `tailwind.config.ts`, `biome.json`, `postcss.config.js`, etc.

**macOS gotcha.** The default macOS filesystem is case-insensitive. A direct
`git mv Foo.tsx foo.tsx` is a silent no-op — git does not register the rename
and the file system holds both names ambiguously. Always use an intermediate
name when changing case:

```bash
git mv Foo.tsx _foo.tsx
git mv _foo.tsx foo.tsx
```

This rule is not enforced by Biome today (`useFilenamingConvention` is off to
accommodate env-var patterns elsewhere). Review catches violations. If drift
becomes a problem, re-evaluate enabling the rule with exceptions.
```

- [ ] **Step 2: Verify lint is clean**

```bash
pnpm run lint
```

Expected: clean. The `.md` file is not linted by Biome but the doctree is in `context/`, which is outside any lint glob.

- [ ] **Step 3: Commit**

```bash
git add context/conventions/code-style.md
git commit -m "docs(conventions): codify kebab-case file naming with macOS gotcha"
```

---

## Phase 3 — Smoke + PR

### Task 3.1: Docker boot + route walk

**Files:** (none — verification)

- [ ] **Step 1: Rebuild + boot**

```bash
pnpm run docker:build
pnpm run docker:up
sleep 8
pnpm run docker:logs 2>&1 | grep -E 'zeno_online|api_listening|commands_poller_started|logs_retention_scheduled'
```

Expected: all four startup lines present.

- [ ] **Step 2: Walk every dashboard route**

Use Playwright MCP (screenshots saved to `tmp/.playwright-mcp/`, per user preference):

- `http://localhost:3000/login` — screenshot `login.png`
- `http://localhost:3000/` — screenshot `home.png`
- `http://localhost:3000/crons` — screenshot `crons-list.png`
- `http://localhost:3000/crons/new` — screenshot `crons-new.png`
- `http://localhost:3000/crons/<any-id>` — screenshot `cron-detail.png`
- `http://localhost:3000/sessions` — screenshot `sessions-list.png`
- `http://localhost:3000/sessions/<any-thread-id>` — screenshot `session-detail.png`
- `http://localhost:3000/logs` — screenshot `logs.png`
- `http://localhost:3000/settings` — screenshot `settings.png`

Expected: each page renders the same as before the refactor — palette, layout, interactive elements. No blank content, no 500, no React runtime errors in `browser_console_messages`.

- [ ] **Step 3: Stop**

```bash
pnpm run docker:down
```

- [ ] **Step 4: Delete the rename script**

```bash
rm -f tmp/rename-kebab.sh
```

(`tmp/` is gitignored, so no commit needed; this is housekeeping.)

- [ ] **Step 5: Push the branch**

```bash
git push -u origin refactor/dashboard-kebab-case
```

- [ ] **Step 6: Open PR via `/open-pr`**

Invoke the `/open-pr` skill/command. Title should be something like:
`refactor(dashboard): rename component files to kebab-case + convention`

Description summarizes: 21 file renames, import updates via disposable script, new File naming section in `context/conventions/code-style.md`, no behavior changes, quality-gate green, Docker smoke walked all 9 routes.

Do NOT merge — user reviews first.

---

## Done

Dashboard components are uniformly kebab-case. Convention doc records the rule plus the macOS gotcha for future renames. Spec B (0016 — extract `@zeno/ui`) is unblocked.
