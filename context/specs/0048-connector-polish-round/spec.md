---
status: shipped
feature: connector-polish-round
created: 2026-04-27
shipped: 2026-04-27
---
# Connector Polish Round Spec

**Status:** Draft
**Scope:** Bundle 7 independent polish items closing out the github_app v2 + connector quality work. Each item is small but each materially improves OSS-readiness or production-grade behavior. Items: Klaviyo per-tool category override, refresh-failure status surfacing, stale-but-valid token cache during outages, log noise reduction, yaml fallback hard-removal for `always_sensitive`, orphan-rule warnings in dashboard, glob regex relaxation for leading-`*`.

This spec is the LAST in the github_app v2 batch (0043 → 0044 → 0045 → 0046 → 0047 → 0048). Independent of 0046; depends on 0044 (refresh interval logic), 0045 (catalog schema), 0047 (rules table + glob matcher).

## Brainstorm Q&A

User delegated decisions to AI for 0046-0048 with constraints: best-for-zeno-overall, OSS-ready, not-lazy.

### Q1 — Klaviyo per-tool category override mechanism

**Decision: New optional field `categoryPrefixMap: Record<string, ToolCategory>` on `catalogEntrySchema`.**

Background: Klaviyo's MCP prefixes ALL tool names with `klaviyo_*` (e.g., `klaviyo_get_campaigns`, `klaviyo_create_event`). The standard `classifyToolCategory` looks for `read_/list_/get_/search_/find_` prefixes — none of which match `klaviyo_*`-prefixed tools. Result: all 28 Klaviyo tools fall through to `interactive` (default permission `ask`), which means the operator pays the classifier_gate "auto-allow" tax on every Klaviyo call.

**Catalog entry shape:**
```json
{
  "id": "klaviyo",
  ...
  "categoryPrefixMap": {
    "klaviyo_get_": "read",
    "klaviyo_list_": "read",
    "klaviyo_search_": "read",
    "klaviyo_find_": "read",
    "klaviyo_create_": "write",
    "klaviyo_update_": "write",
    "klaviyo_delete_": "write",
    "klaviyo_subscribe_": "write",
    "klaviyo_unsubscribe_": "write",
    "klaviyo_assign_": "write",
    "klaviyo_upload_": "write"
  }
}
```

**Matcher logic** (`packages/mcp-discover/src/discover.ts`'s `classifyToolCategory`):
1. If catalog has `categoryPrefixMap` and any prefix matches the tool name, use that category.
2. Else fall through to standard `READ_PREFIXES` / `WRITE_PREFIXES` matching.
3. Else `interactive`.

**Apply at regen + at install time:** the regenerator reads `categoryPrefixMap` from the catalog entry and applies it during tool list projection. The install endpoint (per spec 0045) reads the catalog tools and copies them with categories pre-applied.

Rationale:
- Compact + declarative: 11 prefixes cover all 28 Klaviyo tools.
- Doesn't mutate `classifyToolCategory` for non-prefixed catalogs (zero risk to Sentry/Linear/etc.).
- OSS-friendly: future MCPs with similar prefix convention add their own map without code change.

Alternative considered: full per-tool category override (`{name: 'klaviyo_get_campaigns', category: 'read', ...}`). Rejected — verbose; 28 explicit overrides per Klaviyo regen is gold-plated.

### Q2 — Refresh failure dashboard surfacing

**Decision: Status pill `DEGRADED` (amber) on the App row in C7 listing AND on the App detail page (C8) header.**

When `GitHubAppAuth.refreshAll()` fails for an installation:
1. The error is logged (today).
2. NEW: a `connector_apps.last_refresh_error_at` timestamp is set on the parent App row.
3. Dashboard polls `/api/connectors` periodically (TanStack Query 30s `refetchInterval`); fresh data shows the timestamp.
4. UI rule: if `last_refresh_error_at` is within the last 1 hour → render `DEGRADED` amber pill on App row + detail header.
5. After a successful refresh: `last_refresh_error_at` is NULLed; pill disappears.

**Visual:** new pill state in the design system (artboard 05 — Palette · Status). Amber color (`#D9B362` already exists for accents; use a slightly muted variant `#C99F4F` or reuse pending amber). DEGRADED label all-caps.

**Detail page expansion:** C8 header subtitle adds inline "⚠ X installations failing refresh — last error: <timestamp>". Click reveals the actual error message.

Rationale:
- OSS UX: silent failure is the worst outcome. Operators need to KNOW their App is degraded.
- 1-hour window: aligns with token TTL (60min); after that, tokens expire naturally and connectors fail outright.
- Polling at 30s is cheap (HTTP-only, single endpoint).

### Q3 — Stale-but-valid cache during outage

**Decision: `getCachedToken` returns the cached token if it's not yet expired, even if it's within the 5-min refresh margin. Combine with retry-with-exponential-backoff for refresh.**

**Current behavior** (per spec 0044 design):
```ts
getCachedToken(installationName: string): string | null {
  const cached = this.cache.get(installationName);
  if (!cached) return null;
  if (cached.expiresAt.getTime() - Date.now() <= TOKEN_REFRESH_MARGIN_MS) return null;  // 5min
  return cached.token;
}
```

**New behavior:**
```ts
getCachedToken(installationName: string): string | null {
  const cached = this.cache.get(installationName);
  if (!cached) return null;
  // Token still valid (not yet expired)?
  if (cached.expiresAt.getTime() <= Date.now()) return null;  // hard expiry
  // Otherwise, return token regardless of margin (stale-but-valid is OK during outages)
  return cached.token;
}
```

**Refresh retry logic** (added to `refreshAll`):
- On any installation refresh failure, schedule a retry with exponential backoff: 30s, 60s, 120s, 240s, 480s (max 8min).
- Retries are independent per installation (one failing doesn't delay others).
- Successful retry resets the backoff for that installation.

Rationale:
- During GitHub API outage, the system continues to work with valid (if soon-to-expire) tokens.
- Refresh recovery is fast: aggressive retry with backoff catches transient outages within minutes.
- Trade-off: a token might be used 1-4min before its hard expiry. Practical impact: agent calls might fail at the API call's HTTP level if the token expires mid-call. Mitigation: agent retries on auth-error errorKind (deferred to a separate spec; v1 accepts the rare race).

### Q4 — Log noise reduction

**Decision: `github_app_token_refreshed` logs only on failure, first-time success, or after-failure recovery. Add a single `github_app_refresh_cycle_complete` aggregate log per cycle.**

**Today:**
```
[token_refreshed] AcmeBooks
[token_refreshed] AcmeShop
[token_refreshed] Flavia-Nasser-OMS
[token_refreshed] chatdesk-brasil
```
Every 55min × 4 installations = 96 entries/day. Noisy.

**New:**
- Skip log on routine successful refresh (most common path).
- Log on failure: `github_app_token_refresh_failed` (level: warn) with installation name + error.
- Log on first-time success after a failure: `github_app_token_refresh_recovered` (level: info).
- Log on first-time success on boot: `github_app_token_initialized` (per installation).
- One summary log per cycle: `github_app_refresh_cycle_complete` (level: info, count of installations refreshed, count succeeded vs failed).

**Effect:** steady state = 1 log/cycle (24/day for `fn` profile). Failures + recoveries surface clearly.

Rationale: matches the project's "say nothing if nothing surprising" rule (CLAUDE.md). Operators can debug failures via the failure logs without noise drowning them.

### Q5 — Yaml fallback hard-removal for `always_sensitive`

**Decision: Remove the yaml `approvals.always_sensitive` field from the config schema. Spec 0047 already moved authoritative source to DB; this spec removes the yaml fallback path entirely.**

**Changes:**
1. `apps/worker/src/guardrails/config.ts`: remove `always_sensitive` from the zod schema. Boot fails with a helpful error if the field is still present in yaml: "Field `approvals.always_sensitive` is no longer supported in yaml. Migrate to DB-managed rules in `/settings`. See spec 0047."
2. `profiles/fn/config.yaml`: remove the field (the data was already migrated by 0047's boot migration).
3. Documentation: add a migration note to README.

Rationale:
- After 0047 ships, the yaml field has zero authority — keeping it is a footgun (operator might edit it expecting it to apply, but DB takes precedence silently).
- Hard-fail on its presence forces a clean transition.

### Q6 — Orphan rule warnings in dashboard

**Decision: Inline warning on each orphan row + aggregate "X orphans" indicator in the section header.**

**An orphan rule** is a `manual` or `yaml-migrated` rule whose pattern doesn't match any currently-enabled tool across all installed connectors.

**Detection:** new endpoint `GET /api/approval-rules?include=match-status` returns each rule with `matchStatus: { matchCount, isOrphan }`. The dashboard hook fetches this once per page load and re-fetches on connector add/remove.

**UI:**
- Section header: "Sensitive tools · 5 rules · ⚠ 2 orphans" (amber if any orphans).
- Each row: if `isOrphan`, render with a small ⚠ icon + tooltip "no current tools match — installed since this rule was added?".
- "Remove orphans" button in the section header (mass-action; deletes all orphan manual + yaml-migrated rules with single confirmation).

Rationale:
- OSS UX: stale rules accumulate over time as users add/remove integrations. Surfacing them prevents the rules list from becoming a graveyard of dead patterns.
- Mass-action button is opt-in (operator might prefer per-row review).

### Q7 — Glob regex relaxation for leading-`*`

**Decision: Relax pattern validation regex from `/^[\w*-]+(__[\w*-]+)*$/` to `/^[\w*-]*(__[\w*-]+)*$/`.**

The original regex required at least one literal char before the first `__`. The new regex allows leading `*` (e.g., `*delete*`).

**Tested patterns post-change:**
- `*delete*` ✅ matches `mcp__sentry__delete_project`, `mcp__linear__delete_issue`
- `mcp__github*` ✅ matches all github tools (suffix wildcard)
- `*__merge_pull_request` ✅ matches across all installations
- `mcp__github-app-*__merge_pull_request` ✅ specific
- `mcp__*__delete_*` ✅ "delete tools across any MCP"

**Risk:** `*` alone matches everything. If operator types `*` they create a "always-sensitive everything" rule. Acceptable — unusual but valid; match-preview shows "matches X tools" which makes the consequence obvious.

Rationale:
- Power users want `*delete*`-style patterns without workarounds.
- Frontend match-preview prevents footgun.

## Context

After specs 0043-0047 ship, the github_app v2 work is functionally complete. This spec adds production polish:
- Klaviyo's 28 tools currently classify as `interactive` — operator pays auto-allow tax on every call.
- Refresh failures from `GitHubAppAuth` are silent in the dashboard.
- During GitHub API outages, tokens within 5min of expiry are dropped; could continue serving them.
- `github_app_token_refreshed` log spam.
- Yaml fallback for `always_sensitive` lingers after 0047 — confusing.
- Orphan rules accumulate in the rules list with no visibility.
- Glob regex blocks leading-`*` patterns.

Each item is independent and small (each ~50-150 LOC). Bundling avoids 7 separate spec ceremonies for items that don't justify their own lifecycle.

## Problem Statement

Production polish gaps that don't fit elsewhere. Each one is real (referenced by gap inventory or by 0046/0047's deferrals).

## Non-Goals

1. **New features.** All items are improvements to existing behavior.
2. **Visual design changes.** UI changes (DEGRADED pill, orphan ⚠ icon) reuse design system primitives.
3. **Schema migrations.** Q2 adds 1 nullable column (`connector_apps.last_refresh_error_at`); Q5 removes a yaml field but no DB migration.
4. **Audit log enhancements.** `connector_audit_log` already has the events surfaced here.
5. **Multi-app support, OAuth, encryption-at-rest** — all deferred.

## Constraints

- **OSS readiness**: every UI string is generic; no hardcoded operator/org values.
- **Backwards compat**: all changes are additive at the schema level. Yaml `always_sensitive` removal (Q5) is a hard-fail with helpful error message, NOT a silent drop.
- **No breaking changes** to the public API surface beyond Q5's yaml field.
- **Reuse design system**: amber DEGRADED pill matches existing pending-style.

## Schema Changes

### Altered table: `connector_apps`

```sql
ALTER TABLE connector_apps ADD COLUMN last_refresh_error_at TEXT;
ALTER TABLE connector_apps ADD COLUMN last_refresh_error_message TEXT;
```

Both nullable. Worker `GitHubAppAuth.refreshAll` writes them on failure; clears on success.

### New migration in `migrations.ts`

ID: next available at ship time. Today the live array ends at id 5; specs 0044, 0045, 0047 each add migrations earlier (assuming sequential implementation). The implementer claims whichever integer is next available when writing the migration — the body is independent of the assigned id.

## Files Created

- (Q2) `apps/dashboard/src/components/connectors/listing/degraded-status-pill.tsx` — amber DEGRADED pill for App rows.
- (Q6) `apps/dashboard/src/components/settings/orphan-rule-warning.tsx` — inline ⚠ + aggregate header.
- (Q7) `apps/worker/tests/guardrails/policies/glob-leading-star.test.ts` — adversarial test cases for the relaxed regex.

## Files Modified

- (Q1, schema) `apps/api/src/lib/catalog-loader.ts` — `catalogEntrySchema` adds optional `categoryPrefixMap: z.record(z.string(), z.enum(['read', 'write', 'interactive'])).optional()`.
- (Q1, classifier) `packages/mcp-discover/src/discover.ts` — `classifyToolCategory` accepts an optional `prefixMap` second arg; checks it first before falling through to standard prefixes.
- (Q1, options threading) `packages/mcp-discover/src/discover.ts` — `DiscoverOptions` gains `categoryPrefixMap?: Record<string, ToolCategory>`. `discoverTools` reads it and passes to `classifyToolCategory` for each tool.
- (Q1, regenerator) `apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs` — the `--fetch-from-mcp` path reads `entry.categoryPrefixMap` from the catalog and includes it in the `DiscoverOptions` passed to `discoverTools`. The mirror-only (no-fetch) path is unaffected — it reads pre-categorized `entry.tools[]` from the catalog file as-is.
- (Q1, catalog data update) `agent/connectors-catalog.json` — two-step edit:
  1. Add `categoryPrefixMap` to the Klaviyo entry (a static field added by hand or via PR).
  2. Re-run `--fetch-from-mcp` to project the 28 tools with the new categories applied — overwrites the `tools[]` array of the Klaviyo entry. Snapshot file regenerated in lockstep.
- (Q2) `packages/storage/src/migrations.ts` — new migration adds the 2 columns.
- (Q2) `packages/storage/src/repos/connector-apps.ts` — repo methods to set/clear refresh error timestamp.
- (Q2) `apps/worker/src/github/app-auth.ts` — `refreshAll` updates `last_refresh_error_at` on failure / null on success.
- (Q2) `apps/api/src/routes/connectors.ts` — `AppListItem` shape includes `lastRefreshErrorAt: string | null` + computed `statusAggregate: 'active' | 'mixed' | 'error' | 'degraded'`. The listing handler computes degraded if `last_refresh_error_at` is within 1h.
- (Q2) `apps/dashboard/src/components/connectors/listing/app-row.tsx` — render DEGRADED pill when `statusAggregate === 'degraded'`.
- (Q3) `apps/worker/src/github/app-auth.ts` — `getCachedToken` returns stale-but-valid; `refreshAll` adds exponential backoff retry per installation.
- (Q4) `apps/worker/src/github/app-auth.ts` — log refactor (skip routine success, log on failure/recovery/init, aggregate cycle log).
- (Q5) `apps/worker/src/guardrails/config.ts` — remove `always_sensitive` from `ApprovalsSchema`. Add a **pre-parse rejection check** in the `loadApprovalsConfig` boot path: before parsing, if the raw yaml object has a key `always_sensitive`, throw `Error('Field approvals.always_sensitive is no longer supported in yaml. Migrate to DB-managed rules in /settings. See spec 0047.')`. Pre-parse check (rather than `.strict()`) targets only this specific deprecated key without rejecting unrelated future additions to the approvals block.
- (Q5) `profiles/fn/config.yaml` — remove `approvals.always_sensitive` field (data already in DB via spec 0047).
- (Q5) `README.md` — add a "Migration from yaml" note linking to spec 0047.
- (Q6) `apps/api/src/routes/approval-rules.ts` — two changes: (a) `GET /` accepts `?include=match-status` query param; returns `Rule & { matchStatus: { matchCount, isOrphan } }[]`; (b) new `POST /remove-orphans` endpoint mass-deletes orphan rules (body `{confirm: true}`, returns `{deletedCount}`).
- (Q6) `apps/dashboard/src/components/settings/sensitive-tools-section.tsx` — render ⚠ inline + aggregate count.
- (Q7) `apps/worker/src/guardrails/policies/always-sensitive-glob.ts` — regex relaxed.
- (Q7) `apps/api/src/routes/approval-rules.ts` — pattern zod regex relaxed.

## API Changes

### Modified: `GET /api/connectors` (extends spec 0045's listing endpoint)

`AppListItem` shape gains:
- `lastRefreshErrorAt: string | null`
- `statusAggregate: 'active' | 'mixed' | 'error' | 'degraded'` — computed:
  - `degraded` (amber): `lastRefreshErrorAt` is within the last 1 hour. App-level transient issue (refresh failing).
  - `error` (red): at least 1 installation has a connector-level `lastError` set in the past 24h (e.g., GitHub returned 401 on token mint, or installation_id became invalid). Hard failure.
  - `mixed` (gray): some installations are `enabled` and others are `paused` (operator manually paused via toggle). Functional but operator-controlled state.
  - `active` (green): all installations enabled, no recent errors, no recent refresh failures. Default healthy state.

### Modified: `GET /api/approval-rules?include=match-status`

Returns each rule with:
```ts
{
  ...Rule,
  matchStatus: {
    matchCount: number,    // how many tools currently match
    isOrphan: boolean,     // matchCount === 0 AND source !== 'auto'
  }
}
```

### New: `POST /api/approval-rules/remove-orphans`

Mass-deletes all orphan rules (matchStatus.isOrphan && source !== 'auto'). Body: `{confirm: true}`. Returns `{deletedCount}`.

## User Stories / Scenarios

| ID | Item | Description |
|---|---|---|
| PR1 | Q1 Klaviyo classification | Re-run regenerator with categoryPrefixMap set on Klaviyo entry → 28 tools projected with correct categories (e.g., `klaviyo_get_campaigns` → `read`, `klaviyo_create_event` → `write`). Owner DM "list latest campaign" no longer triggers classifier_gate (read tools auto-allow). |
| PR2 | Q2 Refresh failure UI | Mock GitHub API outage → `refreshAll` fails for 1 installation → `last_refresh_error_at` updated → next listing fetch shows DEGRADED pill on the App row. Recover from outage → next refresh success clears the timestamp → pill disappears within 30s of next poll. |
| PR3 | Q3 Stale cache during outage | Mock 60-min outage. Tokens minted at start of outage stay in cache. At 55min mark (4min before expiry), the next agent turn calls `getCachedToken` → returns valid token (within hard-expiry, even if within 5min margin). Agent succeeds. |
| PR4 | Q4 Log noise | Worker boots, refreshes 4 installations → 4 `github_app_token_initialized` logs + 1 cycle-complete. Next 24h of cycles → 24 `cycle_complete` aggregate logs (one per cycle). Failure: 1 `refresh_failed` + 1 `cycle_complete` showing `succeeded: 3, failed: 1`. |
| PR5 | Q5 Yaml fallback removed | After spec 0047 migration, yaml has `always_sensitive: [...]`. Operator deploys 0048. Worker boots, validates yaml schema → fails with "Field `approvals.always_sensitive` is no longer supported in yaml. Migrate to DB-managed rules in `/settings`." Operator removes the yaml field, redeploys → boot succeeds. |
| PR6 | Q6 Orphan rules | Operator manually added a rule `mcp__github-app-bigorg__merge_pull_request` for an installation that no longer exists (uninstalled later). Settings page now shows the rule with ⚠ icon + tooltip. Header shows "5 rules · ⚠ 1 orphan". Click "Remove orphans" → confirmation → orphan deleted → list updates. |
| PR7 | Q7 Glob leading-* | Operator adds rule `*delete*` → match-preview shows "matches 4 tools across 3 connectors" → save → next agent call to any `delete_*` tool triggers always_sensitive. |

## Success Criteria

- All 7 polish items implemented per their decisions.
- Klaviyo re-categorization confirmed by inspecting `agent/connectors-catalog.json` after regen (read/write/interactive split is correct).
- DEGRADED pill renders correctly on App row + detail header during simulated outage.
- Stale-but-valid cache logic unit-tested with adversarial timing.
- Log volume reduced (verified by counting log lines in 24h fn profile run).
- Yaml `always_sensitive` removal causes hard-fail until profile is updated.
- Orphan warnings + bulk-remove flow work end-to-end.
- Glob leading-`*` patterns parse and match correctly.
- 3 clean reviews.
- Quality gate green.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Klaviyo categoryPrefixMap misconfigured (e.g., a write tool classifies as read) | Regen-time output reviewed manually before merge. Add unit test asserting `classifyToolCategory` with the Klaviyo prefixMap returns expected categories for sample tool names. |
| DEGRADED pill becomes "always degraded" if a single installation has flaky GitHub auth | 1-hour window: if outage longer than 1h, the connector itself goes into hard `error` state (token expires). DEGRADED is transient. |
| Stale-but-valid cache returns a token that GitHub revoked between refresh and use | Acceptable rare case. The MCP call fails with auth error; agent retries on next turn (refresh has by then succeeded). |
| Hard-fail on yaml `always_sensitive` is disruptive for users mid-upgrade | Migration note in README + helpful error message guide the user. Detected before agent processes any messages. |
| Orphan detection iterates all rules × all tools | O(rules × tools) is fine for typical scale (~50 rules × ~200 tools). Not optimized; benchmarked. |
| Glob `*` alone matches everything | Match-preview component (shipped in spec 0047 as part of the Add Rule modal) shows "matches X tools" before save. Operator confirms intent. Edge case: rare, accepted. If 0047 hasn't shipped yet, this footgun is unmitigated — wait for 0047 before relaxing the regex. |
| Multiple polish items create a chunky PR | Each item is independently reviewable. Phased rollout possible (each item in its own commit on the same branch). |

## Open Questions

All resolved by AI per delegation.

## Coverage gaps (acknowledged)

- Audit log enhancements (audit per-rule mutations) — out of scope.
- Token-rotation telemetry / metrics — out of scope; deferred to a future observability spec.
- Multi-rule bulk add via JSON import — deferred (not yet needed).
- Klaviyo-specific tool descriptions vs categories nuance (e.g., `klaviyo_assign_template` is technically write but might want `interactive` for safety) — accepted: maps `assign_` to write per default. If operator wants different, they override per-tool via permissions UI on the connector detail page.

## Review procedure

3 consecutive review rounds.

## Implementation order

1. **Phase 0**: Spec docs + 3 reviews (this).
2. **Phase 1** (Q1): catalog schema + classifier prefixMap + regenerator support + Klaviyo regen.
3. **Phase 2** (Q2): migration adds columns + repo + refresh error tracking + UI pill.
4. **Phase 3** (Q3): `getCachedToken` + retry-with-backoff in `refreshAll` + tests.
5. **Phase 4** (Q4): log refactor.
6. **Phase 5** (Q5): yaml schema removal + helpful error + profile config edit.
7. **Phase 6** (Q6): match-status endpoint + orphan UI + bulk-remove.
8. **Phase 7** (Q7): glob regex relaxation + tests.
9. **Phase 8**: Quality gate green. Smoke against `fn` profile.
10. **Phase 9**: `status: shipped`, commit, PR.

## Definition of Done

- All 7 items shipped + tested.
- 3 clean reviews.
- Quality gate green.
- OSS readiness: no operator-specific values; tests use generic fixtures.
- Smoke green on `fn` profile (each item exercised manually).
