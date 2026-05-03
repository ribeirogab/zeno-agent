---
feature: ui-dashboard-cleanup
plan: "[[plan]]"
spec: "[[spec]]"
created: 2026-04-30
---
# 0066 — UI dashboard cleanup — Tasks

**For this plan:** `[[plan]]`

## Phase D: Replace stylized connector logos with official brand assets

### Task D1: Slack — multicolor official SVG

- [ ] Step 1: Download official 4-color hashtag from `https://upload.wikimedia.org/wikipedia/commons/d/d5/Slack_icon_2019.svg` to `agent/assets/connectors/slack.svg` (overwrite existing).
- [ ] Step 2: Verify the SVG opens in a browser and shows the 4 brand colors (`#E01E5A`, `#36C5F0`, `#2EB67D`, `#ECB22E`).
- [ ] Step 3: Commit — `feat(agent): replace slack.svg with official multicolor (spec 0066 D)`.

### Task D2: GitHub — Octocat at official `#1B1F23`

- [ ] Step 1: Download from `https://upload.wikimedia.org/wikipedia/commons/9/91/Octicons-mark-github.svg` to `agent/assets/connectors/github.svg` (overwrite).
- [ ] Step 2: Verify renders as Octocat shape on `#0F1119` panel (sufficient contrast).
- [ ] Step 3: Commit — `feat(agent): replace github.svg with official Octocat (spec 0066 D)`.

### Task D3: Klaviyo — official PWA logomark (PNG)

- [ ] Step 1: Download from `https://www.klaviyo.com/icons/icon-512x512.png` to `agent/assets/connectors/klaviyo.png`.
- [ ] Step 2: Delete `agent/assets/connectors/klaviyo.svg`.
- [ ] Step 3: In `agent/connectors-catalog.json` — find the Klaviyo entry's `"icon": "klaviyo.svg"` and change to `"icon": "klaviyo.png"`.
- [ ] Step 4: Visual verify in `/connectors` catalog grid.
- [ ] Step 5: Commit — `feat(agent): replace klaviyo logo with official PNG (spec 0066 D)`.

### Task D4: Swarmia — official org avatar (PNG)

- [ ] Step 1: Download from `https://github.com/swarmia.png?size=400` to `agent/assets/connectors/swarmia.png`.
- [ ] Step 2: Delete `agent/assets/connectors/swarmia.svg`.
- [ ] Step 3: In `agent/connectors-catalog.json` — find Swarmia entry's `"icon": "swarmia.svg"` and change to `"icon": "swarmia.png"`.
- [ ] Step 4: Visual verify.
- [ ] Step 5: Commit — `feat(agent): replace swarmia logo with official PNG (spec 0066 D)`.

## Phase B: Remove `sessions` from sidebar nav

### Task B1: Drop `sessions` from `NavId` + `NAV` + path matcher + icon switch

- [ ] Step 1: In `apps/dashboard/src/components/layout/dashboard-sidebar.tsx:6-14` — remove `'sessions'` from the `NavId` union.
- [ ] Step 2: Same file lines `16-27` — remove the `{ id: 'sessions', ... }` entry from `NAV`.
- [ ] Step 3: Same file `navIdForPath` (~line 51-61) — remove the `if (path.startsWith('/sessions'))` line.
- [ ] Step 4: Same file `NavIcon` switch (~line 144-213) — remove the `case 'sessions':` block.
- [ ] Step 5: Verify `apps/dashboard/src/routes/_authed/sessions.{index,$threadId}.tsx` still exist and compile.
- [ ] Step 6: `pnpm --filter dashboard test` — green.
- [ ] Step 7: Commit — `feat(dashboard): drop sessions from sidebar nav (spec 0066 B)`.

### Task B2: Test asserts no sessions in rendered nav

- [ ] Step 1: In `apps/dashboard/tests/components/dashboard-sidebar.test.tsx` (create if missing) — add a test that mounts `<DashboardSidebar />` with a router stub and asserts `screen.queryByText('sessions')` returns `null`.
- [ ] Step 2: Add a sibling test asserting all 7 expected items render: `home, crons, channels, connectors, skills, logs, settings`.
- [ ] Step 3: `pnpm --filter dashboard test -- dashboard-sidebar` — green.
- [ ] Step 4: Commit — `test(dashboard): assert sidebar nav has no sessions (spec 0066 B)`.

## Phase A: USER.md name in sidebar

### Task A1: Backend — extend `GET /api/settings` with `profile` block

- [ ] Step 1: Find where `GET /api/settings` builds its response in `apps/api/src/routes/settings.ts`. Identify the helper that loads profile files (likely calls into `loadProfileFile` from worker/system-prompt or reads the bind-mounted path).
- [ ] Step 2: Add a `profile` field to the response: `{ name: string | null, slug: string }`. Source: parse YAML frontmatter of `profile/USER.md` for `name`. Slug is the active profile dir name (env var `ZENO_PROFILE` or default `'default'`).
- [ ] Step 3: If frontmatter is missing/unparseable, return `name: null`.
- [ ] Step 4: Update the zod schema (or TS type) for the response.
- [ ] Step 5: Verify with curl: `curl localhost:3000/api/settings | jq .profile` returns `{ name, slug }`.
- [ ] Step 6: Commit — `feat(api): expose profile.name+slug in GET /api/settings (spec 0066 A)`.

### Task A2: Backend test — `profile` field shape

- [ ] Step 1: In `apps/api/tests/routes/settings.test.ts` — add a test that mounts the route with a fixture USER.md (frontmatter `name: Operator`) and asserts response.profile equals `{ name: 'Operator', slug: 'default' }` (or whichever fixture profile).
- [ ] Step 2: Add a sibling test for missing frontmatter → `name: null`.
- [ ] Step 3: `pnpm --filter @zeno/api test -- settings` — green.
- [ ] Step 4: Commit — `test(api): cover settings.profile field (spec 0066 A)`.

### Task A3: Frontend — `useSettings` exposes `profile`; sidebar reads it

- [ ] Step 1: In `apps/dashboard/src/lib/use-settings.ts` — extend `SettingsSnapshot` type with `profile: { name: string | null, slug: string }`.
- [ ] Step 2: In `apps/dashboard/src/components/layout/dashboard-sidebar.tsx:295-315` — replace the hardcoded `User()` body. Pull `useSettings()`, derive: `displayName = profile.name ?? profile.slug`, `subtitle = profile.slug + ' · profile'`, `initials = (profile.name ?? profile.slug).slice(0, 2).toUpperCase()`. For multi-word `name` (contains space), initials = `firstWord[0] + lastWord[0]`.
- [ ] Step 3: Drop the strings `"alex"`, `"AL"`, `"single-owner · hmac"` entirely.
- [ ] Step 4: While settings is loading, render a skeleton placeholder (use existing `<Skeleton />` from `@zeno/ui` if present).
- [ ] Step 5: Test the rendered output side-by-side with the Paper artboard `0066 · /connectors (with Playwright)` (sidebar bottom-left should show `operator` + `fn · profile` when running against the fn profile).
- [ ] Step 6: Commit — `feat(dashboard): user row reads name+slug from USER.md (spec 0066 A)`.

### Task A4: Frontend test — user row contract

- [ ] Step 1: In `apps/dashboard/tests/components/dashboard-sidebar.test.tsx` — add a test that mocks `useSettings` to return `{ profile: { name: 'Operator', slug: 'fn' }, ... }` and asserts the user row renders `Operator`, `fn · profile`, `GA`.
- [ ] Step 2: Add a fallback test for `{ name: null, slug: 'default' }` → renders `default`, `default · profile`, `DE`.
- [ ] Step 3: Add a multi-word test: `{ name: 'Maria José', slug: 'fn' }` → initials `MJ`.
- [ ] Step 4: `pnpm --filter dashboard test -- dashboard-sidebar` — green.
- [ ] Step 5: Commit — `test(dashboard): cover user row name+slug+initials (spec 0066 A)`.

## Phase C: Playwright connector (default-installed)

### Task C1: Add the official Playwright SVG asset

- [ ] Step 1: Save the official Microsoft Playwright multicolor logo to `agent/assets/connectors/playwright.svg`. Source: `https://playwright.dev/img/playwright-logo.svg`.
- [ ] Step 2: Verify the file is valid SVG and renders in Chrome by opening `file:///.../playwright.svg`.
- [ ] Step 3: Commit — `feat(agent): add official playwright.svg (spec 0066 C)`.

### Task C2: Trim Playwright catalog entry

- [ ] Step 1: In `agent/connectors-catalog.json` — edit the Playwright entry (search for `"id": "playwright"`):
  - `description`: 1 line, ≤120 chars (e.g. `"Browser automation. Navigate, snapshot, click, type, screenshot."`).
  - `tools`: replace the ~30-entry list with exactly 5 entries — `browser_navigate`, `browser_snapshot`, `browser_take_screenshot`, `browser_click`, `browser_type` — each with `category` and `defaultPermission`. Use `read` + `always_allow` for snapshot/screenshot/navigate; `interactive` + `ask` for click/type.
  - Keep `transport: "stdio"`, `transportConfig: { command: "npx", args: ["-y", "@playwright/mcp@latest"] }`, `icon: "playwright.svg"`.
- [ ] Step 2: Validate the JSON parses (`node -e 'JSON.parse(require("fs").readFileSync("agent/connectors-catalog.json"))'`).
- [ ] Step 3: Visually verify in `/connectors` catalog grid (after Phase A is shipped).
- [ ] Step 4: Commit — `chore(catalog): trim playwright entry (spec 0066 C)`.

### Task C3: Idempotent DB seed migration for Playwright

- [ ] Step 1: In `packages/storage/src/migrations.ts` — append a new migration block (id = current_max + 1):
  ```sql
  INSERT INTO connectors
    (slug, kind, name, description, transport, transport_config, enabled, created_at, updated_at)
  SELECT
    'playwright', 'mcp', 'Playwright',
    'Browser automation. Navigate, snapshot, click, type, screenshot.',
    'stdio',
    '{"command":"npx","args":["-y","@playwright/mcp@latest"]}',
    1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  WHERE NOT EXISTS (SELECT 1 FROM connectors WHERE slug = 'playwright');
  ```
- [ ] Step 2: Migration name: `seed-playwright-connector` with a comment explaining default-install rationale.
- [ ] Step 3: Run a fresh boot test: delete `data/zeno.db`, `pnpm run docker:up`, verify Playwright row exists with `enabled=1`.
- [ ] Step 4: Run an upgrade test: with an existing DB that already has Playwright (or has it uninstalled — slug present, enabled=0), re-run migrations and verify NO change to that row.
- [ ] Step 5: Commit — `feat(storage): seed playwright connector on first boot (spec 0066 C)`.

### Task C4: Seed migration test (idempotency + uninstall preservation)

- [ ] Step 1: In `packages/storage/tests/repos/connectors.test.ts` — add a test "seeds playwright on fresh DB" → run all migrations against an empty DB, assert exactly one row with slug='playwright' and enabled=1.
- [ ] Step 2: Add a test "is no-op on second run" → run migrations twice, assert exactly one row.
- [ ] Step 3: Add a test "preserves operator uninstall" → seed Playwright, manually `UPDATE connectors SET enabled=0 WHERE slug='playwright'`, re-run migrations, assert enabled stays 0.
- [ ] Step 4: `pnpm --filter @zeno/storage test -- connectors` — green.
- [ ] Step 5: Commit — `test(storage): cover playwright seed idempotency (spec 0066 C)`.

## Phase D: Quality gate + manual E2E

### Task D1: Quality gate

- [ ] Step 1: `pnpm run quality-gate` — all turbo tasks green.
- [ ] Step 2: If any task fails, fix and re-run before opening the PR.

### Task D2: Live E2E in Docker (Rule 1)

- [ ] Step 1: Wipe local Docker volume: `docker volume rm zeno-default_workspace-default` (or use a fresh profile dir).
- [ ] Step 2: `pnpm run docker:build && pnpm run docker:up`.
- [ ] Step 3: Open `http://localhost:3000`. Verify:
  - Sidebar bottom shows `operator` (or whatever the active USER.md says) + `default · profile` + initials.
  - Sidebar nav has 7 items, no `sessions`.
  - `/connectors` page shows Playwright as first row in installed (`5 tools · default`, ACTIVE), and as first card in catalog with the official multicolor logo + "DEFAULT" gold pill.
- [ ] Step 4: In Slack `#zeno`-equivalent channel — `@zeno-agent take a screenshot of https://example.com`. Verify worker logs show `mcp__playwright__browser_navigate` + `browser_take_screenshot` invocations and the agent replies with the screenshot data (or a confirmation message).
- [ ] Step 5: Type `/sessions` in browser URL — page still loads (deep-link survives).

### Task D3: Open PR via `/open-pr`

- [ ] Step 1: Confirm with owner before pushing.
- [ ] Step 2: Use `/open-pr` slash command — auto-generates title + description from the spec.
- [ ] Step 3: PR title format: `feat: UI dashboard cleanup (spec 0066)`.
