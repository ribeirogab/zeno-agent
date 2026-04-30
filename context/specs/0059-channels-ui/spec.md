---
status: draft
feature: channels-ui
created: 2026-04-29
shipped: null
---
# Spec 0059 — Channels UI section in dashboard

**Status:** Draft
**Branch:** `feat/spec-0059-channels-ui` (worktree: `../zeno-agent-worktrees/0059-channels-ui/`)
**Scope:** Add a dedicated `/channels` section to the dashboard so the operator can install, view, edit secrets for, and uninstall channel transports (Slack today; future Telegram, WhatsApp) via UI — matching the management ergonomics already available for MCP connectors. Without this spec, channels are manageable only via curl + DB queries (the operator-facing gap that surfaced post-spec-0058 cutover). Stacked on `main` after PR #23 lands.

**Paper-first.** Phase 0 of this spec updates artboards in the "Hearty island" Paper file with the new `/channels` index + detail layouts, gets visual approval, then implementation follows the approved Paper export.

## Context

Specs 0057 + 0058 shipped Slack as a `kind='channel'` connector and migrated `profiles/fn` from `.env`-based credentials to DB-stored connector secrets. The supporting API surface (`GET /api/channels/catalog`, `GET /api/channels`, `POST /api/connectors` with `kind: 'channel'`) all works. The `connectors` table cleanly hosts both kinds.

**What's still missing:** any UI for it. The dashboard's `/connectors` page filters `kind='mcp'` (so channel rows don't pollute the MCP list), and there's no `/channels` route. Operator's only management path today is direct curl with cookie auth — exactly the kind of friction the project's "everything via dashboard" rule (`context/_index/rules.md`, `tmp/zeno-cleanup-contract.md`) exists to prevent. Specs 0057/0058 explicitly deferred the UI to a "future polish spec" — this is that spec.

The dashboard has well-established patterns at `/connectors` (list page at `connectors.index.tsx`, detail page at `connectors.$id.tsx`, catalog install modal at `components/connectors/catalog-install-modal.tsx`). Spec 0059 mirrors those patterns for channels — by **copying** files into a `channels/` namespace rather than generalizing. Per subagent counterpoint (`Option B` on Q2): MCP and channels will diverge sharply (channels = transport, often singleton, OAuth-flow-bound; MCP = capability, n:m, tool catalog). A shared `kind`-prop component becomes a god component within two months. Copies are cheaper than premature abstraction here.

## Problem Statement

Three problems the UI gap creates:

1. **Operator can't manage Slack via dashboard.** Install requires `curl -X POST /api/connectors`. View secrets requires direct DB query (`docker exec ... sqlite3`). Rotation requires curl PATCH. Uninstall requires curl DELETE. This violates the project rule that *all integrations are configurable via the dashboard*.

2. **No discoverability for future channels.** When Telegram/WhatsApp specs ship (already in roadmap as 0066+), there's no place to put them. Dashboard has nav entries for `connectors`, `crons`, `sessions`, `skills` — no `channels`. Adding the UI now establishes the pattern; future channels just become a new entry in `agent/channels-catalog.json`.

3. **Channel state is invisible.** If a Slack token gets revoked, or a `connections:write` scope is missing, or the channel adapter logged an error during socket-mode reconnect — the operator only sees this in `docker logs zeno-fn-agent-1`. A channels detail page surfaces `lastError`, `lastErrorAt`, `lastVerifiedAt` (fields already on the row, never displayed).

## Non-Goals

The following are explicitly OUT of scope for spec 0059:

- **Adding new channel types.** Telegram/WhatsApp are future specs (0066+ TBD). Spec 0059 only ships UI for the EXISTING catalog (Slack today; structure ready for more). Each future channel adds one entry to `agent/channels-catalog.json` and zero dashboard code.
- **Custom channels (non-catalog).** Like spec 0057's connector install flow, channels only support `source: 'catalog'`. No "Custom channel" install path.
- **Test endpoint.** MCP connectors have a `POST /test` endpoint that exercises auth before install. Channels don't have an equivalent concept (no MCP server to spawn; the auth happens when socket-mode connects on next worker boot). UI shows `lastVerifiedAt` from the row (when present); explicit test action is out of scope.
- **Toggle enable/disable.** Connector status can be `enabled | disabled | pending`. UI for spec 0059 shows status read-only. Toggling is a future polish.
- **Lifecycle log / invocations log.** MCP detail page shows recent invocation history. Channels don't invoke (they receive). Out of scope.
- **Bulk operations.** No "select multiple, uninstall all" — there's only ever 1 of each channel kind for v1.
- **Editing the dashboard `/connectors` page.** It already filters `kind='mcp'` correctly (per spec 0057). No regressions, no refactor.
- **Rebranding / visual redesign.** Channels page uses the existing "Hearty island" design language. Tier 0 rebranding (per `backlog.md`) is a future spec; channels just adopts whatever design system is current.
- **Accessibility audit.** Existing dashboard isn't audited for a11y; channels page matches. Future spec covers a11y across the board.
- **Multi-profile installations.** A single dashboard manages a single profile's channels. Spec 0059 doesn't touch profile switching (already deferred per backlog Tier 3 #21).

## Approach

The work breaks into 4 tracks. Phase 0 (Paper artboards) gates the rest — design lands before code.

### Track 0 — Paper artboards (Phase 0)

Update the "Hearty island" Paper file with two new artboards:

1. **Channels index** — list view with Slack card (icon, name, status pill, "manage" button). Empty state: "No channels installed" + "Install Slack" CTA opening the catalog install modal.
2. **Channels detail** — Slack-installed view. Header (icon + name + status + uninstall in overflow menu). Body sections: **Secrets** (masked tokens with edit button) + **Last verified** + **Last error** (only if non-null).
3. **Catalog install modal (channels variant)** — list of catalog entries (Slack today; future TG/WPP appear automatically). Click → expands the secret fields (App Token, Bot Token with help text from catalog). Submit → success toast + redirect to detail.

Mirrors the design language of `/connectors` index + detail (same card grid, same secret-field component, same status pills). NEW components are the empty-state card and the channel-specific detail layout.

**Approval gate:** owner reviews the artboards in Paper. Changes round-trip until approved. THEN implementation begins.

### Track 1 — API: dedicated `/api/channels/:id` detail endpoints

Per Q4 decision: parallel endpoints, channel-shape responses, NO `kind` collision in API.

**New endpoints in `apps/api/src/routes/channels.ts`:**

- `GET /api/channels/:id` — returns the channel row in a channel-specific shape:
  ```ts
  {
    id: string,
    slug: string,            // 'slack', 'telegram', etc.
    catalogId: string,        // 'slack', etc.
    displayName: string,
    description: string | null,
    status: ConnectorStatus,
    lastError: string | null,
    lastErrorAt: string | null,
    lastVerifiedAt: string | null,
    createdAt: string,
    updatedAt: string,
    iconUrl: string | null,   // resolved from channels-catalog
    secrets: Array<{          // masked, mirrors /api/connectors/:id shape
      key: string,
      masked: true,
      last4: string,
    }>,
  }
  ```
  Returns 404 if id doesn't exist OR row exists but `kind !== 'channel'` (defense in depth — never expose MCP rows via this endpoint).

- `PATCH /api/channels/:id/secrets` — body: `{ secrets: Array<{ key: string, value: string }>, mode?: 'merge' | 'replace' }`. **Synchronous direct DB write** via `ConnectorRepo.replaceSecrets()` (NOT command-queue async like the connectors `PATCH /:id` `connector_update` flow — channels don't need an MCP-server-restart side-effect; secrets land in DB and the next worker boot picks them up).
  - `mode: 'merge'` (default): route reads existing secrets, overlays submitted ones (match by key), passes merged set to `replaceSecrets()`. Lets UI submit only changed keys without losing unchanged values. THIS IS THE CONTRACT THE UI USES.
  - `mode: 'replace'`: route passes submitted secrets directly to `replaceSecrets()`. Full replace. Useful for programmatic clients that want to wipe-and-replace.
  - Returns 204. Returns 404 for non-channel id.

- `DELETE /api/channels/:id` — body none. **Synchronous direct DB delete** via `ConnectorRepo.delete()` (NOT command-queue — uninstall doesn't need worker side-effect; FK CASCADE drops `connector_secrets`). Returns 204. Returns 404 for non-channel id.

**Why sync (not async) for channels:** the connectors `connector_update`/`connector_uninstall` command flow exists because MCP connectors require runtime side-effects (re-spawn MCP server with new env, refresh tool list, etc.). Channels have NO runtime side-effect during a secrets edit or uninstall — secrets are read at next worker boot, and uninstall is just a row delete. Direct sync writes are simpler, immediate (no polling needed for the UI), and correct.

**Existing `apps/api/src/routes/connectors.ts:GET /:id`** stays unchanged; the legacy `kind: 'connector'` UI discriminator stays. Channel rows shouldn't be hit via the connectors detail endpoint in normal operation, but if they are, response is best-effort (works because both kinds share storage).

### Track 2 — Dashboard route: `/channels` index page

**New file:** `apps/dashboard/src/routes/_authed/channels.index.tsx` — copied from `connectors.index.tsx` and trimmed to channel-shape:

- Uses TanStack Query to fetch BOTH `GET /api/channels` (installed list — flat array) AND `GET /api/channels/catalog` (entries with iconUrl — **wrapped: `{ channels: ChannelCatalogEntry[] }`**, NOT a flat array; this asymmetry exists because spec 0057 designed the catalog response that way; do NOT copy the connectors-catalog hook pattern verbatim — connectors catalog returns a flat array, channels catalog does not). The list endpoint deliberately omits `iconUrl` (per spec 0057's narrow projection); UI **joins client-side** by `catalogId` against `response.channels` to derive each card's icon. This avoids amending the list endpoint and keeps the projection lean for future API consumers that don't need icons.
- React Query keys: use `['channels']` for the list, `['channels', id]` for detail, `['channels', 'catalog']` for the catalog. Keep namespace separate from the existing connectors keys (`['connectors']`, `['catalog']`) to avoid stale-data collisions.
- Renders one card per installed channel. Card shows: icon (resolved from catalog by matching `catalogId`), name, status pill, "manage" link to `/channels/:id`.
- "Install" button (top-right, primary) opens the channels catalog install modal.
- Empty state: card with channel-shaped placeholder + "Install Slack" CTA.
- NO transport/tools/MCP-specific UI bits.

### Track 3 — Dashboard route: `/channels/:id` detail page

**New file:** `apps/dashboard/src/routes/_authed/channels.$id.tsx` — copied from `connectors.$id.tsx` and trimmed:

- Header: icon + name + status pill + uninstall in overflow menu.
- Body sections (in order):
  1. **Secrets** — list of masked secret fields. Edit button opens `channels-edit-secrets-modal.tsx` (Track 4) which PATCHes via `PATCH /api/channels/:id/secrets`. Mirrors connectors page pattern.
  2. **Last verified** — pretty-formatted date if non-null; "Never verified" otherwise.
  3. **Last error** — red callout with `lastError` text + `lastErrorAt`, only if `lastError !== null`.
- NO transport/command/args/url section.
- NO tool catalog list.
- NO invocation history list.
- Uninstall: opens `channels-uninstall-confirm-dialog.tsx` (Track 4): "Uninstall Slack? Bot will stop responding to messages." Confirm → DELETE → toast + redirect to `/channels` index.

### Track 4 — Channels-specific components

**New folder:** `apps/dashboard/src/components/channels/`:

- `channels-catalog-install-modal.tsx` — copied from `connectors/catalog-install-modal.tsx` and adapted. **What gets REMOVED in the copy** (audit at implementation time — implementer must explicitly delete these blocks, not leave them as dead code):
  - The "test connection" button + `useTestCatalogConnection` mutation + `ResultStrip` component (lines ~59-71, ~200-242, ~299-307 of the connectors source). Channels have no test endpoint (per Non-Goals). The button shouldn't appear at all.
  - The `customInstallComponent` routing wrapper (lines ~22-35) — channels catalog entries are all secret-form-based, no special install components.
  - Any github-app-specific install paths.
  - References to the connectors-catalog endpoint or any MCP-tools rendering.

  **What's KEPT**:
  - Catalog list rendering with icon + name + description.
  - Secret-fields form per catalog entry's `secrets[]` schema.
  - Submit button → POST `/api/connectors` with `kind: 'channel'` + `source: 'catalog'` body shape (per spec 0057).
  - Polling pattern after POST (per the Install data flow).
  - Error state for catalog fetch failure ("Channels catalog unavailable").

  Slack-only today; structure stays for TG/WPP without modification.
- `channels-edit-secrets-modal.tsx` — extracted (NOT inlined). Modal opened from the detail page's Edit button. Renders one input per catalog secret key with placeholder "currently set: ****<last4>"; on submit, POSTs `PATCH /api/channels/:id/secrets` with `{ mode: 'merge', secrets: [...] }` (only changed keys per Data flow — view + edit secrets).
- `channels-uninstall-confirm-dialog.tsx` — extracted (NOT inlined). Simple shadcn AlertDialog, "Uninstall Slack? Bot will stop responding to messages." Confirm → DELETE → toast + redirect.

(Both are extracted, not inlined, to mirror the connectors pattern at `apps/dashboard/src/components/connectors/` and keep the route files focused on layout/data-fetching.)

**Shared shadcn primitives** (already exist; no new shared components):
- `<StatusBadge>` — channels reuse the existing connector status badge component (same enum).
- Form inputs, dialog, button, card — all from shadcn/ui under `apps/dashboard/src/components/ui/`.

### Track 5 — Sidebar nav

**Modify:** `apps/dashboard/src/components/layout/dashboard-sidebar.tsx`:

- Add `channels` to the `NavId` type union.
- Insert `{ id: 'channels', label: 'channels', to: '/channels' }` ABOVE `connectors` in the `NAV` array (conceptual ordering: where Zeno talks → what Zeno calls).
- Add `if (path.startsWith('/channels')) return 'channels';` to the active-state matcher.
- Add a `channels` icon entry to the `NavIcon` switch in `dashboard-sidebar.tsx`. The existing icons are inline SVG paths (no lucide-react import in this file). Add a new inline SVG matching the existing style — a "speech bubble" or "chat" silhouette is on-pattern for "channels". Concrete spec to match siblings (`crons`, `sessions`, `connectors`): 24×24 viewBox, **stroke-based** (`fill: 'none'`, `stroke: 'currentColor'`, `strokeWidth: 1.5`), `strokeLinecap: 'round'`, `strokeLinejoin: 'round'` — copy the shared `props` object at the top of the `NavIcon` switch in `dashboard-sidebar.tsx` (the same one used by every existing icon). A simple rounded-rect chat bubble with a tail rendered as a stroked outline (no fills) reads as one consistent set with the other nav icons.

## Architecture

### Component map

```
apps/api/src/routes/
└── channels.ts                                       # +3 endpoints (GET :id, PATCH :id/secrets, DELETE :id)

apps/api/tests/routes/
└── channels.test.ts                                  # +tests for the 3 new endpoints

apps/dashboard/src/routes/_authed/
├── channels.index.tsx                                # NEW (list + install modal)
├── channels.$id.tsx                                  # NEW (detail + uninstall + edit secrets)
├── connectors.index.tsx                              # unchanged
└── connectors.$id.tsx                                # unchanged

apps/dashboard/src/components/
├── channels/                                         # NEW folder
│   ├── channels-catalog-install-modal.tsx            # NEW (copy of connectors/catalog-install-modal.tsx, channel API endpoints)
│   ├── channels-edit-secrets-modal.tsx               # NEW (mirror of connectors edit-secrets pattern)
│   └── channels-uninstall-confirm-dialog.tsx         # NEW (simple confirm)
└── layout/
    └── dashboard-sidebar.tsx                         # +channels nav entry

agent/
└── (no changes — channels-catalog.json + slack.svg already exist from spec 0057)
```

### Data flow — install Slack

```
User clicks "Install Slack" on /channels (empty state)
  ↓
Modal opens, fetches GET /api/channels/catalog
  ↓
User pastes App Token + Bot Token, clicks Install
  ↓
POST /api/connectors body: { source: 'catalog', catalogId: 'slack', kind: 'channel', secrets: [...] }
  ↓
HTTP 204 (async via command queue — install IS still command-queued because
the worker handler validates against the catalog and synthesizes the row)
  ↓
Modal polls GET /api/channels every 1s up to 10s. **Success predicate**:
the response array contains an entry where `catalogId === submittedCatalogId`
('slack' for today). Status is NOT checked — by the time the row exists in
the DB, the worker has already passed catalog validation and bound the row;
status may be 'enabled' or 'disabled' depending on subsequent verification,
but the operator can manage either via the detail page. Polling on `status`
would hang forever if Slack has a transient verify failure on first connect.
  ↓
Once predicate matches: close modal, toast "Slack installed", refetch
/api/channels list. List renders the new card; click → /channels/<id>
  ↓
If timeout (10s without the predicate matching): close modal, show error toast
  "Install in progress — the channel will appear shortly. Refresh the page
  if it doesn't show within a minute." Modal closes regardless; the row
  WILL appear in the list once the worker processes the queue.
```

(Polling pattern matches the spec 0058 cutover playbook — install IS async via command queue; UI waits for the worker. Edit-secrets and uninstall are direct DB writes per Track 1, NO polling.)

### Data flow — view + edit secrets

```
GET /api/channels/:id → response with masked secrets [{ key, masked: true, last4 }]
  ↓
Detail page renders secret fields read-only with last4 masking
  ↓
User clicks Edit → modal opens with one empty input PER catalog secret key
  (each input shows placeholder "currently set: ****<last4>" so operator knows
  what's already configured; inputs themselves are EMPTY — no React-DevTools leak)
  ↓
User fills SOME or ALL inputs (empty = "keep current value", filled = "replace")
  ↓
On submit, UI builds the body by including ONLY keys whose input is non-empty.
Empty inputs are NOT sent — the backend's mode='merge' overlay preserves them.
  ↓
PATCH /api/channels/:id/secrets body:
  { mode: 'merge', secrets: Array<{ key, value }> }
  where the array contains only the keys the operator actually changed
  ↓
Backend: read existing secrets, overlay submitted ones (matching by key),
  call ConnectorRepo.replaceSecrets() with the merged full set
  ↓
HTTP 204; toast "Secrets updated"; modal closes; detail page refetches
```

**Full-replace semantics + UX merge:** `ConnectorRepo.replaceSecrets()` is full-replace (DELETE all, INSERT submitted). To support "edit just one secret, leave the other as-is," the UI must capture the unchanged secret values somehow. Two options:

- **Option (a) [PREFERRED]:** the UI never sees plaintext of unchanged secrets. To merge, the API endpoint accepts a NEW `mode` field on the request body: `{ mode: 'merge' | 'replace', secrets: [...] }`. With `mode: 'merge'` (default), the backend reads existing secrets, overlays the submitted ones (matching by key), and calls `replaceSecrets()` with the merged set. With `mode: 'replace'`, behaves as full replace. UI submits `mode: 'merge'` always; only sends keys the operator changed. Cleaner UX, no plaintext leak.

- **Option (b):** UI requires the operator to fill ALL fields every edit. Simpler API, worse UX. Rejected.

**Spec mandates Option (a).** The `PATCH /api/channels/:id/secrets` body schema gains an optional `mode: 'merge' | 'replace'` field defaulting to `'merge'`. Track 1 endpoint description above already says "full-replace semantics" at the storage level — the route handler is what implements the merge before calling the storage layer.

### Data flow — uninstall

```
User clicks "Uninstall" in detail page overflow menu
  ↓
Confirm dialog: "Uninstall Slack? Bot will stop responding."
  ↓
DELETE /api/channels/:id → SYNC direct DB delete via ConnectorRepo.delete()
  (FK CASCADE drops connector_secrets in the same transaction)
  ↓
HTTP 204 returned immediately
  ↓
Toast "Slack uninstalled"; navigate to /channels
List refetches; the row is already gone (no eventual-consistency wait)
```

(Sync DELETE per Track 1 rationale: uninstall has no worker side-effect — a row disappears, that's it. The next worker boot would fail to connect to Slack if the bot was still active, but the operator just chose to disconnect, so that's correct behavior. The connectors `connector_uninstall` command-queue path exists because MCP connectors need worker side-effects, e.g. spawn cleanup; channels don't.)

## Test plan / Success criteria

This spec ships when ALL the following pass on the branch:

**Paper-first (Phase 0):**
- [ ] Two artboards updated in "Hearty island" Paper file (channels index + detail).
- [ ] Catalog install modal artboard added.
- [ ] Owner reviews artboards in Paper. Changes round-trip until owner approves visually.
- [ ] Approved Paper exports referenced from plan.md.

**API surface (Track 1):**
- [ ] `GET /api/channels/:id` returns channel-shape response for kind='channel' rows; 404 for kind='mcp' or unknown ids.
- [ ] `PATCH /api/channels/:id/secrets` replaces secrets atomically; 204 on success; 404 for non-channel rows.
- [ ] `DELETE /api/channels/:id` synchronously deletes the row via `ConnectorRepo.delete()`; 204 on success; 404 for non-channel rows. NO command queue.
- [ ] All 3 endpoints require auth (cookie). 401 without.
- [ ] Tests added in `apps/api/tests/routes/channels.test.ts` (1 happy path + 1 404 for non-channel id + 1 401 unauthed per endpoint = 9 tests minimum, PLUS one regression test for PATCH `mode: 'merge'` semantics: install with `{appToken: 'A', botToken: 'B'}`, PATCH with `{ mode: 'merge', secrets: [{ key: 'botToken', value: 'B2' }] }`, then GET and assert `appToken` is still readable as 'A' and `botToken` is now 'B2' = 10 tests minimum). Pattern: copy the auth-cookie helper from `apps/api/tests/routes/connectors.test.ts` (the `signSession` + COOKIE_NAME pattern); existing 11 channels tests in `channels.test.ts` already use this — extend, don't duplicate the helper.

**Dashboard list page (Track 2):**
- [ ] `/channels` route renders.
- [ ] Empty state shows "Install Slack" CTA.
- [ ] After install, list shows Slack card with icon, name, status pill, "manage" link.
- [ ] Install modal opens; submits successfully; polls for the row; closes on success.

**Dashboard detail page (Track 3):**
- [ ] `/channels/:id` route renders.
- [ ] Header shows icon + name + status.
- [ ] Secrets section shows masked App Token + Bot Token.
- [ ] Edit secrets modal works (empty inputs = no change; filled = replace).
- [ ] Uninstall confirm dialog → confirm → redirect to `/channels` + toast.

**Sidebar (Track 5):**
- [ ] "channels" entry visible above "connectors".
- [ ] Active state correctly highlights when on `/channels` or `/channels/:id`.

**E2E (cleanup contract Rule 1):**
- [ ] Live dashboard at `http://localhost:3000/channels` renders correctly against the running `profiles/fn` (which has Slack already installed since spec 0058 cutover).
- [ ] Detail page at `http://localhost:3000/channels/<slack-id>` shows the actual installed Slack with masked tokens.
- [ ] Edit secrets modal can rotate tokens (and the cutover validation works again — operator rotates, restart container, Slack reconnects with new tokens).
- [ ] Uninstall flow tested in a sandbox if possible; in production, defer to a future genuine token rotation event.

**Quality gate:**
- [ ] `pnpm run quality-gate` green: 30/30 turbo tasks. Test count delta: +10 API tests minimum — 9 standard (3 endpoints × {happy / 404-non-channel / 401-unauthed}) + 1 merge-mode regression (storage and worker untouched).

**Branch review (Rule 2):**
- [ ] R1+R2+R3 fresh reviews CLEAN consecutive. Reset on any blocking finding.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Channels page diverges in implementation from the approved Paper artboards | Phase 0 gate is hard — no code starts until owner approves Paper. plan.md cites the approved Paper export; tasks.md verifies pixel-pegging at each step. |
| Copy-paste from connectors files introduces bugs by leaving MCP-specific bits behind | Each new file gets a top-of-file comment listing what was REMOVED from the connectors counterpart. Implementer audits against the list. Quality gate catches type errors; manual smoke test catches semantic ones. |
| New `/api/channels/:id` endpoint accidentally returns MCP rows for an MCP id | 404 contract: explicit `if (row.kind !== 'channel') return 404`. Test asserts this. Defense in depth — the channels UI never reaches `/api/connectors/:id` so even if the connectors endpoint leaks, the channels page is unaffected. |
| Edit-secrets modal accidentally prefills with masked values | Spec mandates empty fields. Test asserts "modal opens with empty inputs". |
| Sidebar `channels` nav entry breaks on profiles where channels-catalog is malformed | Channels page handles `loadChannelsCatalog` failure (already in spec 0057) by showing an empty list + a banner ("Channels catalog not loaded"). Sidebar entry still appears — channels nav doesn't depend on catalog availability. |
| Uninstall command races with worker processing | Optimistic UI navigates immediately; list refetch eventually shows the channel gone. If worker fails to process (rare), refresh the page; row reappears with `lastError`. |
| Existing `/connectors` page accidentally regresses | Per Q2 Option B (no shared domain components), `/connectors` files are 100% untouched. Test suite includes existing connectors tests; quality gate catches any accidental import collision. |
| Channels-catalog endpoint down (e.g. catalog file missing) | Install modal handles fetch failure with an error state ("Channels catalog unavailable"). Existing channels still listable from `/api/channels`. |
| Secret rotation via edit modal locks operator out of Slack | Mitigation: existing connector secret rotation already works via `PATCH /api/connectors/:id/secrets`. Channels reuse the same storage layer. Risk is no higher than for MCP connectors. |

## Open Questions

None blocking. Q1-Q6 closed before writing this spec:

- Q1 (URL structure): separate `/channels` + `/channels/:id` routes.
- Q2 (component reuse): Option B — copy connectors files into channels namespace; only shadcn primitives shared. Per subagent counterpoint.
- Q3 (detail page scope): minimal v1 (view masked secrets, edit, uninstall).
- Q4 (API kind exposure): Option C — dedicated `/api/channels/:id` + `/secrets` + `DELETE` endpoints. Per subagent counterpoint.
- Q5 (sidebar nav): `channels` above `connectors` in the nav array.
- Q6 (empty state): simple "Install Slack" CTA → catalog install modal.

## Out-of-scope follow-ups

- **Telegram / WhatsApp channels.** Future specs (0066+ TBD). Adding a channel = new entry in `agent/channels-catalog.json` + new adapter class. Channels UI handles them automatically (catalog-driven).
- **Toggle enable/disable.** Future polish. Schema field exists (`status: 'enabled' | 'disabled' | 'pending'`); UI toggle is the only delta.
- **Test connection action.** MCP connectors have a "Test" button that exercises auth before/after install. Channels could have an equivalent (e.g. "ping Slack auth" button). Future polish.
- **Lifecycle log per channel.** Connector-style invocation history doesn't apply (channels receive, don't invoke); but error history (`lastError`/`lastErrorAt` over time) could be useful. Future polish.
- **Custom channels.** Today catalog-only. If someone wants to register a non-catalog channel (e.g. local Webhook or test fixture), that's a separate spec.
- **Multi-instance channels** (e.g. install Slack twice for two different workspaces in one profile). Today single-instance per slug. Multi-install needs slug collision handling + a "workspace" concept on the row.
- **Spec 0058's `GET /api/connectors/:id` legacy `kind: 'connector'` discriminator** stays. Channels UI doesn't use `/api/connectors/:id`; the issue tracked in spec 0058's Errata is moot for this spec.
