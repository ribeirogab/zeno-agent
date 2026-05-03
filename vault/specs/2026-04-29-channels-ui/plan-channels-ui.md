---
feature: channels-ui
spec: "[[spec-channels-ui]]"
created: 2026-04-29
---
# Spec 0059 — Channels UI section in dashboard — Plan

**For this spec:** `[[spec-channels-ui]]`

## Approach

Surface channels (the post-spec-0057 `kind='channel'` connector rows) as a first-class section of the dashboard, alongside `/connectors` and `/skills`. Strategy is **copy-and-trim** rather than generalize — channels and connectors will diverge sharply going forward (channels are transport substrate; connectors are tool surface), so two parallel route trees + two file-local `StatusPill` copies is correct (see Q4 Option-C in the spec). The only shared abstractions are shadcn primitives (button, dialog, card, input).

The work is sequenced bottom-up: **API → list page → detail page → modals → sidebar → quality gate**. API endpoints land first because every UI track consumes them. The list page comes before the detail page because installing a channel from the list is the entry point — without the list working, there's nothing to click into. Modals come third because they're invoked from list (install) and detail (edit-secrets, uninstall). Sidebar nav lands last among UI work because adding `channels` to the `NavId` union is a one-line type change that benefits from the routes already existing.

Paper artboards (Phase 0, **already complete** — CH1, CH2, CH3, M-ch-1, M-ch-2, M-ch-3) lock the visual contract. The implementer copies styles + layout from those artboards using `get_jsx`, `get_computed_styles`, and `get_fill_image` rather than eyeballing screenshots — the artboards are the source of truth for spacing, color, type scale.

TDD throughout. Every API test pattern follows the existing `apps/api/tests/routes/channels.test.ts` (signSession + COOKIE_NAME) — extend, don't duplicate the helper. UI tests are skipped (per project convention — dashboard testing is via Playwright in a future spec, not Vitest). The end-to-end Slack install flow is exercised by manually navigating the dashboard against the running `profiles/default` container after Phase E.

## Architecture

### File structure

```
apps/api/src/
├── routes/channels.ts                                 # +4 endpoints (GET :id, PATCH :id/secrets, DELETE :id, GET catalog/setup/:catalogId)
└── tests/routes/channels.test.ts                      # +13 tests minimum (9 standard + 1 merge regression + 3 setup)

apps/dashboard/src/
├── routes/_authed/
│   ├── channels.index.tsx                             # NEW: list page (Track 2)
│   └── channels.$id.tsx                               # NEW: detail page (Track 3)
├── components/channels/
│   ├── channels-catalog-install-modal.tsx             # NEW: install modal w/ Setup helper panel (Track 4)
│   ├── channels-edit-secrets-modal.tsx                # NEW: edit secrets modal (Track 4)
│   └── channels-uninstall-confirm-dialog.tsx          # NEW: uninstall confirm (Track 4)
├── components/layout/
│   └── dashboard-sidebar.tsx                          # +channels nav entry above connectors (Track 5)
└── lib/
    └── use-channels.ts                                # NEW: TanStack Query hooks for channels endpoints

context/specs/2026-04-29-channels-ui/
├── spec.md                                            # already written + reviewed
├── plan.md                                            # this file
└── tasks.md                                           # next file
```

### Data flow at install (channel-side, full picture)

```
User on /channels (empty state) clicks "install slack"
  ↓
Modal opens, fetches GET /api/channels/catalog       (existing endpoint from spec 0057)
  ↓
Modal also fetches GET /api/channels/catalog/setup/slack  (NEW endpoint, this spec)
  → renders Setup helper panel with 3 numbered steps
    + slack-app-manifest.json content + copy button
  ↓
Operator opens api.slack.com/apps in side tab,
creates app from manifest, generates tokens
  ↓
Operator pastes appToken + botToken in modal, clicks Install
  ↓
POST /api/connectors body: { source: 'catalog', kind: 'channel', catalogId: 'slack', secrets: [...] }
  → existing endpoint from spec 0057 (async via command queue)
  ↓
Modal polls GET /api/channels every 1s up to 10s
  → success predicate: response array contains entry where catalogId === 'slack'
  → on match: close modal, toast "slack installed", navigate to detail
  → on timeout: close modal with "install in progress" toast
```

### Data flow at edit-secrets

```
Detail page (channels.$id.tsx) opens edit-secrets modal
  ↓
Modal renders one input per catalog secret key, all empty
  → placeholder shows "currently set · ••••<last4> · leave empty to keep"
  ↓
Operator fills only changed fields, clicks Save
  ↓
PATCH /api/channels/:id/secrets body: { mode: 'merge', secrets: [{ key, value }] }
  → only changed keys submitted; backend overlays against existing
  ↓
HTTP 204; toast "secrets updated"; modal closes; detail page refetches
```

### Data flow at uninstall

```
Detail page kebab → "uninstall" → uninstall confirm dialog
  ↓
Confirm dialog: "Uninstall {displayName}? Bot will stop responding to {displayName} messages."
  ↓
DELETE /api/channels/:id (sync direct DB delete, FK CASCADE drops connector_secrets)
  ↓
HTTP 204; toast "{displayName} uninstalled"; navigate to /channels list
```

## Phase Ordering

Hard ordering — each phase blocks the next:

```
0. Paper artboards (DONE — pre-merged into Hearty island file as CH1, CH2, CH3, M-ch-1/2/3)
   ↓
A. API endpoints (Track 1)
   ├─ A.1 GET /api/channels/:id (channel-shape detail response)
   ├─ A.2 PATCH /api/channels/:id/secrets (mode: merge | replace, sync direct DB write)
   ├─ A.3 DELETE /api/channels/:id (sync direct DB delete via ConnectorRepo.delete)
   ├─ A.4 GET /api/channels/catalog/setup/:catalogId (returns { steps, manifest })
   └─ A.5 13 tests minimum in apps/api/tests/routes/channels.test.ts
   ↓
B. TanStack Query hooks (apps/dashboard/src/lib/use-channels.ts)
   ├─ B.1 useChannels (list)
   ├─ B.2 useChannel (detail)
   ├─ B.3 useChannelsCatalog (entries with iconUrl)
   ├─ B.4 useChannelSetupHelper (steps + manifest)
   ├─ B.5 useInstallChannel (mutation → POST /api/connectors with kind=channel)
   ├─ B.6 useEditChannelSecrets (mutation → PATCH /api/channels/:id/secrets)
   └─ B.7 useUninstallChannel (mutation → DELETE /api/channels/:id)
   ↓
C. List page (channels.index.tsx)
   ├─ C.1 Empty state (no installed channels) — match Paper CH3
   ├─ C.2 Populated state (1+ channels) — match Paper CH1
   └─ C.3 StatusPill copy from connectors.index.tsx + DB-status mapping
   ↓
D. Modal components
   ├─ D.1 channels-catalog-install-modal.tsx (catalog list + Setup helper + secrets form)
   ├─ D.2 channels-edit-secrets-modal.tsx (per Paper M-ch-2)
   └─ D.3 channels-uninstall-confirm-dialog.tsx (per Paper M-ch-3)
   ↓
E. Detail page (channels.$id.tsx)
   ├─ E.1 Header (icon + name + status pill + meta + kebab)
   ├─ E.2 Secrets section (masked rows + edit button → opens D.2 modal)
   ├─ E.3 Activity section (last verified card + last error card)
   └─ E.4 Uninstall flow (kebab → opens D.3 dialog → DELETE → toast + redirect)
   ↓
F. Sidebar nav (Track 5)
   ├─ F.1 +channels in NavId union
   ├─ F.2 +channels nav entry ABOVE connectors in NAV array
   ├─ F.3 +navIdForPath case for /channels
   └─ F.4 +channels case in NavIcon switch (stroke-based chat-bubble SVG)
   ↓
G. Quality gate
   ├─ G.1 pnpm run typecheck (full repo)
   ├─ G.2 pnpm run lint (full repo)
   ├─ G.3 pnpm run test (vitest, 13+ new API tests)
   └─ G.4 pnpm run quality-gate (30/30 turbo tasks green)
   ↓
H. End-to-end smoke test
   ├─ H.1 docker:up profiles/default
   ├─ H.2 navigate to http://localhost:3000/channels — verify empty state
   ├─ H.3 click "install slack" → verify modal renders Setup helper + manifest
   ├─ H.4 paste real fnlivros tokens → verify install → row appears
   ├─ H.5 click manage → verify detail page renders correctly
   ├─ H.6 edit secrets (rotate botToken only) → verify merge persists
   ├─ H.7 uninstall → verify row deleted + redirect to empty state
   └─ H.8 docker:down
   ↓
I. 3-round branch review (per cleanup contract Rule 2; reset on any BLOCKING finding)
   ↓
J. Push + open PR (target: main)
```

A → B → C → D → E → F is strictly serial. G requires all of A-F. H requires G. I requires H. J requires I clean.

## Risks / Open Decisions

- **StatusPill divergence between connectors routes.** `connectors.index.tsx` uses `'off'`; `connectors.$id.tsx` uses `'disabled'`. Spec mandates the `index.tsx` signature for channels. Implementer must NOT copy from `connectors.$id.tsx` even though the channel detail page is what uses it — the wrong signature will type-error against the DB-mapping helper. Self-check: search the channels routes for the literal string `'disabled'` after copying and confirm zero hits.
- **`formatRelative(iso)` helper duplication.** Currently file-local in 3 connectors routes. Spec accepts a 4th copy in channels routes for consistency. NOT a refactor opportunity in this spec. If a future spec extracts a shared `apps/dashboard/src/lib/format-relative.ts`, it should reconcile all 4 callers.
- **Channels catalog response asymmetry.** `GET /api/channels/catalog` returns `{ channels: [...] }`; the connectors catalog returns a flat array. Implementer must NOT copy the `useCatalog` hook pattern verbatim — `apiFetch<ChannelCatalogEntry[]>('/api/channels/catalog')` would silently produce zero icons. Use `apiFetch<{ channels: ChannelCatalogEntry[] }>('/api/channels/catalog')` and reach into `.channels`.
- **PATCH `mode: 'merge'` regression vector.** The most likely failure mode is calling `replaceSecrets()` with the submitted-only set, dropping existing keys. The merge MUST happen in the route handler before `replaceSecrets`. Required test: install with 2 secrets, PATCH with mode=merge changing only one, GET and assert both are still readable. Already in spec test plan.
- **Polling success predicate.** Match by `catalogId`, NOT by `status`. A bad token leaves the row in `status='disabled'` with `lastError` set; polling on status would hang forever, polling on catalogId resolves cleanly and the operator sees the error in the detail page activity section.
- **Setup helper endpoint manifest source.** The endpoint reads `infra/slack-app-manifest.json` synchronously at request time. The file ships with the worker image (`infra/Dockerfile` already copies it). Implementer must verify the path resolution works in the container — likely needs `path.resolve(import.meta.dirname, '../../../infra/slack-app-manifest.json')` or similar. If the path is wrong, the endpoint will 404 in production but pass in dev where the worktree root differs.
- **TanStack Router file-based naming.** New routes are `channels.index.tsx` and `channels.$id.tsx` — match the existing `connectors.index.tsx` / `connectors.$id.tsx` pattern. The `_authed` parent layout handles auth automatically.
- **Sidebar icon stroke pattern.** The existing nav icons (crons, sessions, connectors, skills) all use `fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round'` with a 24×24 viewBox. The channels icon (chat bubble) MUST follow this exactly to read as one consistent set. Spec line ~160 has the exact prop spec; copy that into the new icon entry.
- **`displayName` non-nullability.** `Connector.displayName` is `string` (no `| null`) per `packages/storage/src/types.ts`. Implementer should NOT add a defensive `?? 'unknown'` guard in the uninstall dialog title — the type guarantees a value.
- **No Docker during testing.** Vitest tests use in-memory SQLite + Hono in-process bootstrap. Phase H's smoke test is the ONLY place that runs `docker:up`, and it's against `profiles/default` (not the operator's `profiles/fn` which is uninstalled per spec 0058 cutover — though the operator may be using a different profile currently; verify with `docker:logs` before H.1).

## Self-Review

After authoring plan.md + tasks.md, verify:

- [ ] Every spec section has at least one task in tasks.md.
- [ ] Phase ordering A→B→C→D→E→F→G→H→I→J is consistent between plan.md and tasks.md.
- [ ] Every task in Phase A (API) has a TDD sequence (test fails → impl → test passes → commit).
- [ ] No `docker:up` / `docker:down` anywhere in Phases A-G.
- [ ] StatusPill copy task references `connectors.index.tsx` (not `$id.tsx`) explicitly.
- [ ] Channels catalog hook task explicitly handles `{ channels: [...] }` envelope.
- [ ] PATCH merge regression test is its own task with explicit assertion code.
- [ ] Polling task references `catalogId === submittedCatalogId` predicate (not status).
- [ ] Sidebar icon task references the stroke-based prop pattern.
- [ ] Each commit message clearly identifies which Phase + Task.
