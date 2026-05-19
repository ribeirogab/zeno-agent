---
status: shipped
feature: ui-dashboard-cleanup
created: 2026-04-30
shipped: 2026-05-03
---
# Spec 0066 — UI dashboard cleanup

**Status:** Shipped (2026-05-03, PR #30 + follow-ups #31/#32/#33)
**Scope:** Four small UI/UX corrections in the dashboard chrome and connectors catalog: (a) replace the hardcoded `"alex"` identity in the sidebar with the live USER.md name + active profile slug; (b) remove `sessions` from the primary nav (keep the route reachable by deep-link); (c) make Playwright a first-boot-installed connector with the official multicolor logo and a trimmed tool surface; (d) replace stylized/placeholder connector logos in the catalog (Slack, GitHub, Klaviyo, Swarmia) with their official brand-color assets.

## Context

The dashboard chrome and connector catalog drifted from the project's reality:

1. **Identity is a lie.** `apps/dashboard/src/components/layout/dashboard-sidebar.tsx:295-315` hardcodes `"AL"` avatar, `"alex"` name, and `"single-owner · hmac"` subtitle. Zeno is single-user — the operator IS the user described in `profiles/<active>/USER.md`. The Paper file already shows `"acme"` in the user row (the design intent), but the code never caught up. In a multi-profile setup (e.g. the live `<example>` instance plus a `default` instance), there is also no way to tell at a glance which profile this dashboard is bound to.

2. **`/sessions` is dead weight in the primary nav.** Sessions are debugging surface — every Slack thread + every cron run lands a session, but operators don't navigate to `/sessions` to *do* anything. They land there from a log entry or a cron run when something goes wrong. Putting it as a top-level nav item next to `home` and `connectors` overstates its importance and crowds the sidebar (8 items today: home, crons, sessions, channels, connectors, skills, logs, settings).

3. **Playwright is misrepresented in the catalog.** The entry in `agent/connectors-catalog.json:1016` references a non-existent `playwright.svg` (no file in `agent/assets/connectors/`); ships a verbose 2-line description; lists ~30 tools (most of them rare); and is not installed by default even though Chromium ships pre-installed in the Zeno container image. New operators who clone the repo see Playwright as one of many catalog entries and have to opt-in via the dashboard before they can do anything browser-related — defeating the "batteries included" promise.

This spec promotes three lines from `context/backlog.md` (raw list items 1, 2, 3) into a coherent S-sized PR. All three are owner-supplied corrections; the brainstorming below records the contrarian counterpoints surfaced via Rule 3 and the owner final calls.

## Problem Statement

A new operator who clones Zeno and runs `pnpm run docker:up` for the first time encounters three independent papercuts:

- **Identity friction**: the dashboard greets them as `"alex"` (or whatever the placeholder is) instead of acknowledging their name from `USER.md`. In a multi-profile setup, no chrome signal indicates which profile is bound.
- **Navigation noise**: `sessions` shouts for attention in the primary nav alongside genuinely-actionable items, but offers nothing to act on directly.
- **Browser dead-end**: Playwright is in the catalog but absent from "installed" + has a broken icon. Without that connector enabled, Zeno cannot navigate, snapshot, click, or fill forms — meaning the freshly-installed agent appears artificially crippled.

Each is small. Together they make Zeno feel unfinished on the very first encounter.

## Non-Goals

- **Out of scope: redesigning the sidebar.** Removing `sessions` is a one-line nav change; the rest (icons, status panel, brand row, exit button) stays intact.
- **Out of scope: deleting the `/sessions` route.** Sessions remain reachable from log entries (`/logs` row click → session transcript) and cron run history (`/crons/$id` run row → session transcript). Only the nav item disappears.
- **Out of scope: merging `/sessions` into `/logs`** as expandable rows or tabs. Counterpoint subagent A and B both raised this as cleaner — it is a larger spec touching `apps/dashboard/src/routes/_authed/sessions.*.tsx` and `logs.tsx` data wiring. Captured as a follow-up in Open Questions.
- **Out of scope: a first-run wizard / onboarding tour.** That belongs in the open-source pre-release Tier 0 work (backlog item #6), not here.
- **Out of scope: changing how `connectors-catalog.json` is loaded or served.** The catalog reader (`apps/api/src/lib/catalog-loader.ts`) and static MIME handler (`apps/api/src/routes/static.ts:5-18` — already supports both `.svg` and `.png`) stay unchanged. We only edit the JSON entry and add the asset file.
- **Out of scope: redesigning the catalog card layout.** The visual structure (avatar box + title + transport pill + description + learn-more) stays as-is. Only the avatar contents change in Phase D.
- **Out of scope: per-row brand color theming.** Avatar background stays `#151824` with subtle gold border for visual consistency; only the inner glyph (formerly a letter, now an SVG) changes.
- **Out of scope: tuning Playwright's default trimmed-tool list at runtime.** The spec defines the *initial* trim; operators can refresh-tools later via `/connectors/playwright` to expand it.

## Constraints

- **No DB schema change for items 1 & 2.** Item 3 needs an idempotent seed migration (additive — see Architecture).
- **API surface for item 1 reuses the existing `GET /api/settings`.** That endpoint already returns `profileFiles` (a list including USER.md). Add a parsed `profile` block alongside it (`{ name, slug }`) — no new route.
- **Source-of-truth for the operator name is `USER.md` frontmatter** (YAML), not the filename or env var. The worker already parses `USER.md` for the system prompt at `apps/worker/src/agent/system-prompt.ts:loadProfileFile`; the api consumes the same parsed shape (don't reparse client-side — counterpoint 0066-A nailed this).
- **Backwards-compatible at the connector catalog level.** Adding the `playwright` entry as default-installed must be idempotent: re-running boot must not duplicate the connector row. Use a unique `slug` constraint check + `INSERT OR IGNORE` (or equivalent) in the seed.
- **Constitution principles:**
  - *No premature multi-user.* The user row stays a chrome element but loses its multi-user-flavored "single-owner · hmac" label. We're not adding auth UI here.
  - *Connectors are the product.* Default-installing Playwright is borderline — counterpoint 0066-B argued it muddies "operator chooses what to install." Owner-call: Playwright is a special case because Chromium ships in the image (already a fixed cost paid). Pre-installing makes the latent capability discoverable + actionable. Operator can uninstall via `/connectors/playwright`, restoring full reversibility. Recorded as Open Question — easy to revert if the philosophy wins out.
  - *Reversibility first.* Each of the three changes is independently revertible (sidebar one line, USER.md endpoint additive, Playwright seed gated by a feature flag-free idempotent check).
- **No Slack / channel work in this spec.** Channels touch `/channels` UI (already shipped in 0059); this spec does not modify it.

## User Stories / Scenarios

1. **Fresh-clone operator boots Zeno for the first time.** They open `http://localhost:3000`, hit the login flow, land on `/` (home). The sidebar bottom-left shows their name (parsed from `profiles/default/USER.md` `name:` frontmatter) + initials avatar + the active profile slug `default`. The `/connectors` page lists Playwright under "installed" with the official multicolor logo and a one-line description. Clicking through to `/connectors/playwright` shows a trimmed surface of 5 essential tools (`browser_navigate`, `browser_snapshot`, `browser_take_screenshot`, `browser_click`, `browser_type`). The agent can immediately handle a "@zeno open this URL and take a screenshot" Slack request without setup.

2. **Operator with two profiles (`default` + `<example>`) boots both dashboards.** Profile `<example>` runs on port 3001, `default` on 3000. Each dashboard sidebar shows its own profile slug + the matching `USER.md` name. No cross-talk; no ambiguity about "which dashboard am I looking at."

3. **Operator who liked the old "alex" placeholder edits USER.md.** They open `profiles/<active>/USER.md`, change `name: Alex` to `name: Operator`. Profile watcher (`apps/worker/src/profile/watcher.ts`) reloads. Next dashboard refresh (or, if we wire it via TanStack invalidation, immediately) shows "Operator" + "OP" initials in the sidebar.

4. **Operator clicks a log entry that has a `sessionId`.** They go from `/logs` → `/sessions/$threadId` directly via deep-link. The `/sessions` route still resolves; only the nav item is gone.

5. **Operator with no use for browser automation.** They open `/connectors/playwright`, click "uninstall." The connector flips to "uninstalled" in the connectors table; next agent turn no longer has Playwright tools. Restoring is a one-click "install from catalog."

6. **Operator inspects an existing install after this spec lands.** Migration runs idempotently — Playwright is added if missing, skipped if already present. No data loss for an operator who manually-installed Playwright before this spec.

## Success Criteria

**Phase A — sidebar identity (item 1):**
- [ ] `apps/dashboard/src/components/layout/dashboard-sidebar.tsx` no longer contains the literal string `"alex"`, `"AL"`, or `"single-owner · hmac"`.
- [ ] The user row renders `name` from USER.md (e.g. "Operator"), initials computed as the first two letters of `name` uppercased (e.g. "OP"), and **the active profile slug** as subtitle (e.g. "default" or "<example>") — replacing the auth-noise.
- [ ] `GET /api/settings` response includes a `profile: { name: string, slug: string }` block. Existing fields (`backend`, `profileFiles`) unchanged.
- [ ] If `USER.md` has no parseable `name:` frontmatter, the dashboard falls back to the profile slug only (e.g. "default · default") — no crash, no placeholder.
- [ ] At least one frontend test asserts the user row reads from the API response, not a hardcoded constant.

**Phase B — sidebar nav (item 2):**
- [ ] `apps/dashboard/src/components/layout/dashboard-sidebar.tsx`: `'sessions'` removed from the `NavId` union (line 6-14), the `NAV` constant (line 16-27), the `navIdForPath` switch (line 51-61), and the `NavIcon` switch (line 144-213).
- [ ] Routes `apps/dashboard/src/routes/_authed/sessions.index.tsx` and `apps/dashboard/src/routes/_authed/sessions.$threadId.tsx` remain, untouched. Deep-link tests still pass.
- [ ] At least one frontend test asserts the rendered sidebar has 7 nav items (home, crons, channels, connectors, skills, logs, settings) and does NOT include "sessions".
- [ ] No 404 if a user types `/sessions` in the browser.

**Phase D — Replace stylized/placeholder connector logos with official brand assets:**
- [ ] `agent/assets/connectors/slack.svg` no longer uses `currentColor` mono fill; replaced with the **official 4-color hashtag** (`#E01E5A`, `#36C5F0`, `#2EB67D`, `#ECB22E`) sourced from Wikimedia (Slack icon 2019).
- [ ] `agent/assets/connectors/github.svg` replaced with the **official Octocat** at `#1B1F23` (Wikimedia Octicons-mark-github), not the previous `#24292E` cinza-grafite.
- [ ] `agent/assets/connectors/klaviyo.svg` replaced with the **official Klaviyo logomark** (PNG accepted — sourced from `klaviyo.com/icons/icon-512x512.png`). Update the catalog entry's `icon` field to `klaviyo.png` if format changes; the static handler in `apps/api/src/routes/static.ts:5-18` already supports `.png`.
- [ ] `agent/assets/connectors/swarmia.svg` replaced with the **official Swarmia mark** (PNG accepted — sourced from the Swarmia GitHub org avatar `github.com/swarmia.png`). Same `icon` field update treatment as Klaviyo.
- [ ] `agent/assets/connectors/linear.svg` and `sentry.svg` already use official brand assets — verified, no changes required.
- [ ] `agent/connectors-catalog.json` icon paths updated where extension changed (`klaviyo.svg` → `klaviyo.png`, `swarmia.svg` → `swarmia.png`).
- [ ] Visual smoke test: catalog grid renders all logos at correct color/contrast against `#0F1119` panel background; no broken-image fallbacks.

**Phase C — Playwright connector (item 3):**
- [ ] `agent/assets/connectors/playwright.svg` exists, is the official multicolor Microsoft Playwright logo (red/orange shield + green mask), and is referenced as `"icon": "playwright.svg"` in `agent/connectors-catalog.json`.
- [ ] The Playwright entry in `agent/connectors-catalog.json` has:
  - One-line `description` (≤120 chars).
  - A trimmed `tools` array of exactly **5 entries**: `browser_navigate`, `browser_snapshot`, `browser_take_screenshot`, `browser_click`, `browser_type` — each with `category` and `defaultPermission` (`ask` for interactive, `always_allow` for read).
  - The transport config unchanged (`stdio` → `npx -y @playwright/mcp@latest`).
- [ ] A new idempotent seed migration in `packages/storage/src/migrations.ts` inserts a Playwright connector row in the `connectors` table with `kind='mcp'`, transport stdio, command `npx`, args `-y @playwright/mcp@latest`, and `enabled = 1`. Re-running the migration is a no-op (uses the unique slug constraint or `INSERT OR IGNORE`).
- [ ] On a fresh boot (`pnpm run docker:build && pnpm run docker:up` against an empty SQLite DB), `/connectors` lists Playwright under "installed" with status `active` (or `pending` if the auth-check tool path applies).
- [ ] An operator who manually installed Playwright before this spec sees no duplicate row after upgrade.

**Quality gate:**
- [ ] `pnpm run quality-gate` green: lint + typecheck + tests across all workspaces.
- [ ] Test count delta: at least +3 (sidebar identity, sidebar no-sessions, Playwright seed idempotency).

**E2E acceptance (Rule 1 — operator-as-user simulation):**
- [ ] Wipe `~/.claude` Docker volume (or run against a fresh `claude_home`) → `pnpm run docker:up` → open `http://localhost:3000`. Sidebar shows correct `USER.md` name + profile slug; `/connectors` shows Playwright installed.
- [ ] In the live `<example>` profile (port 3001), Slack message `@zeno-agent take a screenshot of https://example.com and post it back`. Agent calls `browser_navigate` + `browser_take_screenshot` + a connector-bound file upload tool (post-0064 if available; otherwise replies with the screenshot data) — no operator setup required.
- [ ] Sidebar in the `<example>` dashboard shows `acme · <example>`, not `alex · single-owner · hmac`.

## Architecture

### Component map

```
agent/
├── connectors-catalog.json                       # trim Playwright entry: 1-line description, 5 tools
└── assets/connectors/
    └── playwright.svg                            # NEW: official Microsoft Playwright multicolor SVG

apps/api/src/
└── routes/settings.ts                            # extend response with `profile: { name, slug }`

apps/dashboard/src/
├── components/layout/dashboard-sidebar.tsx       # remove sessions nav + replace hardcoded user row
├── lib/use-settings.ts                           # surface the new `profile` field via SettingsSnapshot
└── tests/components/dashboard-sidebar.test.tsx   # NEW or extended: assert nav + user-row contract

apps/worker/src/
├── agent/system-prompt.ts                        # already parses USER.md frontmatter; expose helper if needed
└── (no other worker change)

packages/storage/src/
└── migrations.ts                                 # +1 idempotent migration: seed Playwright connector

context/specs/0066-ui-dashboard-cleanup/
├── spec.md                                       # this file
├── plan.md                                       # follow-up
└── tasks.md                                      # follow-up
```

### Data flow — sidebar identity (Phase A)

```
profiles/<active>/USER.md (frontmatter: `name: Operator`)
  ↓
worker boot: loadProfileFile('USER.md') → { name: 'Operator', body: '...' }
  ↓
DB / config snapshot has the parsed value (already exists for system prompt)
  ↓
GET /api/settings returns:
  {
    profile: { name: 'Operator', slug: '<example>' },     # NEW
    backend: { ... },                              # unchanged
    profileFiles: [ ... ]                          # unchanged
  }
  ↓
Dashboard useSettings() exposes `profile`
  ↓
DashboardSidebar reads `profile.name` + `profile.slug`
  ↓
User row renders:  [OP]  Operator
                          <example>
                                  [exit]
```

If `name` is missing/unparseable: fall back to `profile.slug` for both the name and the avatar initials (first 2 chars of the slug uppercased, e.g. `EX`).

### Data flow — Playwright seed (Phase C)

```
Boot of worker
  ↓
runMigrations(db)  →  applies migrations 1..N (existing) + N+1 (new):
  - migration N+1 'seed-playwright-connector':
      INSERT OR IGNORE INTO connectors
        (slug, kind, name, transport, transport_config, ...)
        VALUES
        ('playwright', 'mcp', 'Playwright', 'stdio', '{"command":"npx","args":["-y","@playwright/mcp@latest"]}', ...);
  ↓
ConnectorRepo.list() returns Playwright row in `installed`
  ↓
buildMcpServersMap() includes Playwright stdio config
  ↓
ClaudeCodeBackend instantiates SDK with mcpServers map
  ↓
Agent has `browser_navigate`, `browser_snapshot`, etc. available out of the box
```

The seed only inserts the **row in the connectors table**. The catalog JSON (`agent/connectors-catalog.json`) remains the source-of-truth for *what's offered* (description, icon, tool catalog); the DB row is *what's enabled for this profile*. Operator can hit `/connectors/playwright` → uninstall → migration won't reinsert (idempotency guard).

### Counterpoint summary (Rule 3)

| Item | Owner stance | Subagent A | Subagent B | Owner final call |
|---|---|---|---|---|
| (A) Identity | Keep user row, swap source | Drop "single-owner · hmac" subtitle, replace with empty/initials only | Drop user row entirely (no "logged in as" in single-user app) | Keep row + drop subtitle + use **profile slug** as new subtitle (multi-profile signal) |
| (B) Sessions | Remove from nav, deep-link survives | Sessions are audit log, merge into `/logs` as tabs | Hidden routes rot — fold into `/logs` and `/crons` as inline rows | Remove from nav this spec; merge captured as Open Question follow-up |
| (C) Playwright | Default-install + trim + logo | Use idempotent DB seed migration (not UI hardcode) | Don't default-install — pre-select in catalog instead. Reversibility first | DB seed migration with `enabled=1`. Open question: should be `enabled=0` (pre-listed but opt-in)? |

## Test plan

**Unit:**
- `apps/dashboard/tests/components/dashboard-sidebar.test.tsx`:
  - Renders 7 nav items in order; no `sessions` link.
  - With `useSettings` mock returning `profile: { name: 'Operator', slug: '<example>' }`: renders "Operator" + "OP" initials + "<example>" subtitle.
  - With `profile: { name: undefined, slug: 'default' }`: renders "default" + "DE" initials.
- `apps/api/tests/routes/settings.test.ts`:
  - `GET /api/settings` shape includes `profile: { name, slug }` with values from a mocked USER.md frontmatter.
- `packages/storage/tests/repos/connectors.test.ts`:
  - Migration seeds Playwright on a fresh DB.
  - Re-running migrations on a DB that already has the Playwright row is a no-op.
  - DB with a manually-uninstalled Playwright (slug present but inactive) does NOT get a duplicate row.

**Quality gate:**
- `pnpm run quality-gate` green; turbo task count unchanged or +tests.

**E2E (Rule 1):**
- Fresh boot scenario above (User Story 1).
- Multi-profile scenario (User Story 2): boot `default` and `<example>`, screenshot both sidebars side-by-side.
- Playwright actually works: Slack `@zeno-agent` request that requires `browser_navigate` + screenshot. Worker logs show `mcp__playwright__browser_navigate` invocation, response includes a screenshot.

## Open Questions

- **[NEEDS CLARIFICATION]** *Should Playwright be `enabled=1` or `enabled=0` on first boot?* Owner stance is `enabled=1` (raw list said "default-installed" and Chromium is already in the image). Subagent B's reversibility argument has merit. Easy revert: change one column in the seed migration.
- **[NEEDS CLARIFICATION]** *Should `/sessions` route survive long-term, or merge into `/logs` and `/crons` as inline expand-rows?* This spec keeps it as deep-link only. Promote to a separate spec if the friction shows up post-ship.
- **[NEEDS CLARIFICATION]** *Should the dashboard sidebar show the active profile differently — slug as subtitle (this spec) vs as a top-strip badge vs as a small chip on the brand row?* Subtitle is the cheapest landing; Paper-first will validate.
- **[NEEDS CLARIFICATION]** *Initials algorithm for multi-word names ("Maria José")?* Default: first letter of first word + first letter of last word ("MJ"). For single-word names ("Operator"), first 2 letters ("OP"). Document in the test fixture.
- **[NEEDS CLARIFICATION]** *Trimmed Playwright tool list — is `browser_snapshot` better than `browser_take_screenshot` for the LLM?* `snapshot` returns accessibility tree (cheaper to reason about), `screenshot` returns image. Spec keeps both for now; tune at first E2E observation.

## References

- Backlog raw list (items 1, 2, 3): `context/backlog.md` lines 38-57.
- Sidebar code: `apps/dashboard/src/components/layout/dashboard-sidebar.tsx`.
- Settings API route: `apps/api/src/routes/settings.ts`.
- Catalog reader: `apps/api/src/lib/catalog-loader.ts`.
- Catalog JSON: `agent/connectors-catalog.json` (Playwright entry around line 1016).
- Profile parse helper: `apps/worker/src/agent/system-prompt.ts:loadProfileFile`.
- Connector repo: `packages/storage/src/repos/connectors.ts`.
- Constitution: `context/constitution.md` (no premature multi-user; reversibility first).
- Channels-vs-connectors learning: `context/learnings/channel-vs-connector.md`.
- Paper file: `zeno-agent` (`01KPYCJ6QXK8Z1PEVQME9262RP`, page `1-0`) — artboards to update detailed in `tasks.md`.
