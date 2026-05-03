---
feature: ui-dashboard-cleanup
spec: "[[spec]]"
created: 2026-04-30
---
# 0066 — UI dashboard cleanup — Plan

**For this spec:** `[[spec]]`

## Approach

Four independent surface fixes that compose into one S-sized PR. Each phase is reversible on its own.

**Phase A (sidebar identity)** is plumbing-shaped: extend the existing `GET /api/settings` response with a parsed `profile: { name, slug }` block (the worker already parses USER.md frontmatter for the system prompt — we just expose it via the api), then swap the hardcoded `"alex"` strings in `dashboard-sidebar.tsx` for live data via `useSettings()`. No new endpoint, no schema change.

**Phase B (sidebar nav cleanup)** is a 5-line delete in `dashboard-sidebar.tsx`. Routes for `/sessions/*` stay — only the nav entry goes.

**Phase C (Playwright)** has three sub-changes that ship together: a new SVG asset file (Microsoft Playwright official multicolor logo), a tightened `connectors-catalog.json` entry (1-line description + 5 essential tools instead of 30), and an idempotent DB seed migration that inserts the Playwright connector row on first boot. The migration uses `INSERT … ON CONFLICT(slug) DO NOTHING` so re-running boot is a no-op and existing manual installs aren't duplicated.

**Phase D (replace stylized logos)** is pure asset swap: download the official brand SVG/PNG for Slack, GitHub, Klaviyo, Swarmia, drop them in `agent/assets/connectors/`, and update `agent/connectors-catalog.json` icon paths where the extension changes (Klaviyo and Swarmia ship as PNG since the brands don't publish public-domain SVG logomarks). Linear and Sentry already use official brand assets and stay untouched. The static handler at `apps/api/src/routes/static.ts:5-18` already maps both `.svg` and `.png` MIME types — no code change needed for the format swap.

The DB-seed approach (over hardcoding "default-installed" in the UI) was the consensus from Rule 3 brainstorm — it preserves the connector model: Playwright behaves as a normal connector that happens to be pre-installed at first boot, removable like any other.

## Architecture

```
agent/connectors-catalog.json
  └── playwright entry trimmed (1-line desc, 5 tools)

agent/assets/connectors/playwright.svg                  # NEW asset

apps/api/src/routes/settings.ts                         # GET response gains `profile: {name, slug}`

apps/dashboard/src/lib/use-settings.ts                  # SettingsSnapshot.profile field
apps/dashboard/src/components/layout/dashboard-sidebar.tsx
  ├─ NAV array drops 'sessions'
  ├─ NavId union drops 'sessions'
  ├─ navIdForPath drops /sessions case
  ├─ NavIcon switch drops 'sessions' case
  └─ User function reads name/slug from useSettings, computes initials

packages/storage/src/migrations.ts                      # +1 idempotent migration: seed-playwright-connector
```

Data flow at first boot (Phase C):

```
runMigrations(db)
  ↓
migration N+1 'seed-playwright-connector':
  INSERT … ON CONFLICT(slug) DO NOTHING
    (slug='playwright', kind='mcp', transport='stdio',
     transport_config='{"command":"npx","args":["-y","@playwright/mcp@latest"]}',
     enabled=1)
  ↓
ConnectorRepo.list() returns Playwright row
  ↓
buildMcpServersMap() spawns Playwright MCP subprocess
  ↓
Agent has browser_navigate / snapshot / click / type / screenshot available out of the box
```

## File Structure

| File | Change |
|---|---|
| `agent/connectors-catalog.json` | Edit Playwright entry: 1-line description, 5 tools |
| `agent/assets/connectors/playwright.svg` | **NEW** — official multicolor SVG |
| `apps/api/src/routes/settings.ts` | Extend response with `profile: { name, slug }` |
| `apps/api/tests/routes/settings.test.ts` | Test new `profile` field shape |
| `apps/worker/src/agent/system-prompt.ts` | (Optional) export the parsed name helper if not already exposed |
| `apps/dashboard/src/lib/use-settings.ts` | Type `SettingsSnapshot.profile` |
| `apps/dashboard/src/components/layout/dashboard-sidebar.tsx` | Drop sessions; rewrite User row from API data |
| `apps/dashboard/tests/components/dashboard-sidebar.test.tsx` | Assert nav has 7 items, no sessions; user row reads from API |
| `packages/storage/src/migrations.ts` | +1 migration block |
| `packages/storage/tests/repos/connectors.test.ts` | Idempotency test for the seed |
| `agent/assets/connectors/slack.svg` | **REPLACE** — official multicolor (4 brand colors) |
| `agent/assets/connectors/github.svg` | **REPLACE** — official Octocat at `#1B1F23` |
| `agent/assets/connectors/klaviyo.png` | **NEW** (replaces `klaviyo.svg`) — official logomark PNG |
| `agent/assets/connectors/swarmia.png` | **NEW** (replaces `swarmia.svg`) — official org avatar PNG |
| `agent/assets/connectors/klaviyo.svg` | **DELETE** (replaced by `.png`) |
| `agent/assets/connectors/swarmia.svg` | **DELETE** (replaced by `.png`) |

## Phase Ordering

Phases are independent — pick any order. Suggested for one PR:

1. **Phase D** (logo asset swap) — pure asset+JSON edit, smallest cognitive load.
2. **Phase B** (drop sessions from nav) — smallest code change.
3. **Phase A** (USER.md name) — adds API field + dashboard read.
4. **Phase C** (Playwright) — touches catalog JSON + new asset + migration. Largest.

Each phase ends with a passing `pnpm run quality-gate`. Stage commits per phase to keep the diff readable.

## Risks / Open Decisions

- **Initials algorithm for multi-word names**: spec says "Maria José" → "MJ", single-word → first 2 chars. Pin in test fixture; if owner wants differently, adjust there.
- **`enabled=1` vs `enabled=0` for Playwright seed**: spec defaults to `1` (raw list said "default-installed"). Subagent counterpoint argued for `0` (reversibility). Owner decides at implementation time; one column flip in the migration if reversed.
- **`browser_snapshot` vs `browser_take_screenshot`**: both stay in the trimmed list. Owner can prune one after first E2E if cost surprises.
- **Sessions deep-link reachability** (open question in spec): not a code decision for this PR — keep `/sessions` route mounted, validate by typing the URL manually.
- **`profile` API field shape**: `{ name, slug }` is enough for the User row. If a future spec needs more (preferred_language, etc), extend additively.
- **PNG vs SVG for Klaviyo/Swarmia**: brands don't publish public-domain SVG logomarks; we use PNG (512×512 / 400×400) which the static handler already serves. If owner later finds an SVG source, it's a one-line catalog edit.
- **Klaviyo logomark URL stability**: sourced from `klaviyo.com/icons/icon-512x512.png` (their PWA manifest). If they rebrand/move it, asset becomes stale — re-download manually. Not a code-level concern.
- **Swarmia avatar source**: GitHub org avatar (`github.com/swarmia.png`) is informally their public mark. Brandfetch has alternates if avatar gets stale.
