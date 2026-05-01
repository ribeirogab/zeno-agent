# GitHub App v2 — 6-spec batch summary

This document is the at-a-glance map of how specs 0043-0048 fit together to deliver the production-ready, dashboard-managed, OSS-friendly GitHub App connector.

## The 6 specs

| # | Spec | What it ships | Depends on |
|---|---|---|---|
| **0043** | github-app-v2-design | 10 Paper artboards (C7-C10 pages, M6-M11 modais) + PNGs frozen | — |
| **0044** | github-app-v2-backend | `connector_apps` schema, surgical `GitHubAppAuth` mutations, `packages/github-app/` workspace, install/test/discover endpoints, `@live` GitHub API tests | 0043 (visual SOT) |
| **0045** | github-app-v2-install-ui | Listing collapse (1 row "GitHub App"), App detail page (C8), per-installation detail (C10), M6 modal, fix dos 0-tools (migration id 7) | 0044 |
| **0046** | github-app-v2-lifecycle-ui | M7 (auto-discover, multi-select), M8 (manual fallback), M9 (rotate PEM), M10 (remove install), M11 (rename env_var), M12 (uninstall App — new) | 0045 |
| **0047** | always-sensitive-db-ui | `approval_rules` table, glob matcher (`*` em qualquer posição), `/settings` editor, auto-cascade on uninstall | (independent) |
| **0048** | connector-polish-round | Klaviyo classification override, refresh-failure dashboard surfacing, stale-but-valid cache, log noise reduction, yaml hard-removal, orphan rule warnings, glob leading-`*` | 0044, 0047 |

## High-level architecture (after all 6 ship)

```
                            ┌──────────────────────────────────┐
                            │     packages/github-app/         │
                            │   (stateless, shared 0044+)     │
                            │   - signAppJwt                  │
                            │   - fetchAppMetadata            │
                            │   - fetchInstallations          │
                            │   - mintInstallationToken       │
                            └──────────┬───────────────────────┘
                                       │ used by
                          ┌────────────┴────────────┐
                          │                         │
              ┌───────────▼──────────┐      ┌──────▼──────────┐
              │  apps/worker/        │      │   apps/api/     │
              │                      │      │                 │
              │ GitHubAppAuth        │      │ install/test/   │
              │ (stateful)           │      │ discover/rotate │
              │ - getCachedToken    │      │ /uninstall      │
              │ - addInstallation   │      │ endpoints       │
              │ - removeInst...     │      │                 │
              │ - renameInst...     │      │                 │
              │ - rotatePem         │      │                 │
              │ - appUninstall      │      │                 │
              │ + 30s retry-backoff │      │                 │
              └───────────┬──────────┘      └──────┬──────────┘
                          │                         │
                          └─────────┬───────────────┘
                                    │ writes/reads
                          ┌─────────▼─────────┐
                          │   SQLite DB       │
                          │                   │
                          │ connector_apps    │  ← App-level (PEM, app_id, slug)
                          │ connectors        │  ← per-installation rows
                          │ connector_secrets │  ← 3 reserved keys per install
                          │ approval_rules    │  ← sensitive tool patterns
                          │ connector_tool_   │  ← 51 tools × N installations
                          │   permissions     │     with per-install overrides
                          └───────────────────┘
                                    ▲
                                    │ HTTP
                          ┌─────────┴─────────┐
                          │   Dashboard       │
                          │   (TanStack)      │
                          │                   │
                          │  /connectors      │  ← collapsed App row
                          │   github-app      │  ← App detail (C8)
                          │   github-app-fnl... │  ← per-install detail (C10)
                          │  /settings        │  ← sensitive tool rules
                          └───────────────────┘
```

## Data model

**Before** (today, post-0042):
```
connectors                        connector_secrets
├─ id                             ├─ key
├─ slug: "github-app-fnlivros"    ├─ value
├─ ... 4 rows, one per inst       ├─ __GITHUB_APP_ID__   ┐
                                  ├─ __GITHUB_APP_PEM__  │ duplicated
                                  ├─ __GITHUB_INSTALL... │ across 4 rows!
                                  ├─ __GITHUB_INSTALL... │
                                  └─ __GITHUB_ENV_VAR__  ┘
```

**After 0044** (clean):
```
connector_apps                    connectors                   connector_secrets
├─ id (UUID)                      ├─ id                        ├─ key
├─ catalog_id: "github-app"       ├─ slug: "github-app-fnliv"  ├─ value
├─ app_id: "12345"              ├─ app_id (FK) ──→  ↑        ├─ __GITHUB_INSTALL_ID__   ┐
├─ app_slug: "acme-bot"     ├─ ... 4 rows                ├─ __GITHUB_INSTALL_NAME__│ only 3 keys
├─ app_name: "Acme Bot"     │                            └─ __GITHUB_ENV_VAR__     ┘ per install
├─ pem (single source)            └ ON DELETE CASCADE
├─ pem_sha256, pem_rotated_at
└─ last_refresh_error_at
```

## OSS-ready user journey

### Setup (open-source user, never seen Zeno before)

```
1. Clone repo → `pnpm run docker:up`
2. Browser → localhost:3000 → "GitHub App" card no catalog
3. Click → M6 modal
   - Drag .pem onto dropzone (drag-drop OR click-to-pick OR paste)
   - Type app_id
   - Click TEST CONNECTION → sees "credentials valid · 4 installations available"
   - Click INSTALL APP
4. Lands em /connectors/github-app (C8 with empty state — C9 stub)
5. Click "+ ADD YOUR FIRST INSTALLATION" → M7
   - Auto-discover lists orgs (TanStack Query 5min cache)
   - Multi-select via checkboxes
   - "+ ADD 3 INSTALLATIONS" gold button
   - Per-row install status (✓ ✓ ✗ retry)
6. C8 now shows 3 installations · 3/3 ACTIVE (green)
7. Done. Zero yaml editing. Zero file uploads to FTP. Pure dashboard.
```

### Day-2 ops (after install)

```
Need to add another org:
  → /connectors/github-app → "+ ADD INSTALLATION" → M7 → pick → done.

Need to rotate PEM (security best practice):
  → /connectors/github-app → "ROTATE" button next to PEM → M9
  → Drop new .pem → see fingerprint validation → type "Acme Bot" to confirm → ROTATE
  → Atomic update; all 4 installations re-mint tokens automatically.

A skill needs a different env var name:
  → /connectors/github-app → kebab on installation row → "Edit env var" → M11
  → See current ACME_GH_TOKEN, type new FNLIVROS_GH_TOKEN → SAVE
  → Applies in ~2s. Skills using old name see warning beforehand.

Org no longer needed:
  → kebab → "Remove" → M10 → see consequences → type install name → REMOVE
  → Auto: env var unset, MCP tools dropped, related approval rules cleaned.

Want to enforce "ask before merge_pull_request across all 4 installations":
  → /settings → Sensitive tools → "+ ADD RULE"
  → Type: mcp__github-app-*__merge_pull_request
  → Live preview: "matches 4 tools across 4 installations"
  → SAVE. Done. (No more yaml edit per installation!)
```

## Visual hierarchy of artboards (Paper)

```
LISTING (C7) — what user sees first
┌───────────────────────────────────────────────────────────────┐
│ installed                          5 active · 1 error · 1 pending │
├───────────────────────────────────────────────────────────────┤
│ │ Sentry          stdio  ● ACTIVE   2d ago  ⋯                 │
│ │ Linear          remote ● ACTIVE   1m ago  ⋯                 │
│ │ Klaviyo         stdio  ● ACTIVE   5h ago  ⋯                 │
│ │ Swarmia         stdio  ● ACTIVE   1h ago  ⋯                 │
│ │ GitHub Personal stdio  ● ACTIVE   3h ago  ⋯                 │
│ │ ┌────┐                                                       │
│ │ │Gh4│ github-app   stdio  ● 4/4 ACTIVE   1m ago  ⋯  ←───── 1 ROW for App │
│ │ └────┘ 4 installations · catalog                              │
└───────────────────────────────────────────────────────────────┘
                            ↓ click
APP DETAIL (C8)
┌───────────────────────────────────────────────────────────────┐
│ zeno / connectors / github-app                                 │
│ ┌──┐                                          ENABLED 🟡 ⋯    │
│ │Gh│  github-app                                               │
│ └──┘  STDIO ● 4/4 ACTIVE · 4 installations · 1m ago · catalog  │
│                                                                │
│ app config                                  TEST ALL INSTALLS │
├───────────────────────────────────────────────────────────────┤
│ APP ID                                       public · safe     │
│ │ 12345                                          [📋 COPY] │ │
│ PRIVATE KEY (.PEM)                  last rotated · never       │
│ │ ●●●●●●●●●●●●●●●●●●●●●●●●●●        sha256 5e3b·a1c2·…       │ │
│ │                              [👁 REVEAL] [🔄 ROTATE]       │ │
│                                                                │
│ installations  4 · all healthy · scoped per installation       │
│                                              [+ ADD INSTALL]   │
├───────────────────────────────────────────────────────────────┤
│ INSTALLATION    ENV VAR         TOOLS  STATUS    LAST VERIFIED │
│ │ AcmeBooks      ACME_GH_TOKEN     51   ● ACTIVE    1m ago    ⋯ │
│ │ AcmeShop  QS_GH_TOKEN     51   ● ACTIVE    1m ago    ⋯ │
│ │ Flavia-...    OMS_GH_TOKEN    51   ● ACTIVE    1m ago    ⋯ │
│ │ chatdesk-...  CHATDESK_GH_T...51   ● ACTIVE    2m ago    ⋯ │
│ ⓘ tool permissions per installation · click row to manage     │
└───────────────────────────────────────────────────────────────┘
                            ↓ click row
PER-INSTALLATION DETAIL (C10)
┌───────────────────────────────────────────────────────────────┐
│ zeno / connectors / github-app / AcmeBooks                     │
│ ┌──┐                                          ENABLED 🟡 ⋯    │
│ │FN│  AcmeBooks                                                 │
│ └──┘  STDIO ● ACTIVE · 51 tools · 1m ago · github-app inst    │
│                                                                │
│ installation config                       TEST INSTALLATION    │
├───────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────────────┐│
│ │ ┌──┐ app credentials inherited from github-app   VIEW APP  │││
│ │ │Gh│ app id 12345 · pem managed at app level   ↗         │││
│ │ └──┘ token re-minted every turn                            │││
│ └────────────────────────────────────────────────────────────┘│
│ INSTALLATION ID public  ENV VAR          used by skills · gh   │
│ │ 125887887     COPY  │ │ ACME_GH_TOKEN              EDIT │     │
│                                                                │
│ tool permissions  51 tools · 3 categories · scoped to AcmeBooks │
│ READ-ONLY     8 tools                                          │
│ │ list_issues   ALWAYS_ALLOW   ASK   NEVER                    │
│ │ get_issue     ALWAYS_ALLOW   ASK   NEVER                    │
│ │ ...                                                          │
│ WRITE / DELETE  3 tools                                        │
│ │ create_issue  ALWAYS_ALLOW  [ASK]  NEVER                    │
│ │ ...                                                          │
└───────────────────────────────────────────────────────────────┘
```

## Modal flows

```
M6 (first install)               M9 (rotate PEM — destructive)
┌────────────────┐                ┌──────────────────────┐
│ Add GitHub App │                │ DESTRUCTIVE          │
├────────────────┤                │ Rotate private key   │
│ APP ID         │                ├──────────────────────┤
│ │ 12345    │ │                │ ⚠ this affects all 4 │
│                │                │   installations      │
│ PEM (.pem)     │                │ CURRENT KEY          │
│ ┌──────────┐   │                │ │ ●●●● WILL REPLACE  │
│ │ drag-drop│   │                │                      │
│ │ or paste │   │                │ NEW PRIVATE KEY      │
│ └──────────┘   │                │ ┌────────────────┐   │
│ ✓ valid PEM    │                │ │ ⬆ UPLOAD .PEM  │   │
│                │                │ └────────────────┘   │
│ ✓ creds valid  │                │ ✓ valid · matches    │
│   4 inst found │                │   app id 12345     │
│                │                │                      │
│ AcmeBooks · ... │                │ TYPE 12345 TO CONFIRM│
│                │                │ │ 12345        │   │
│ CANCEL  TEST   │                │                      │
│         INSTALL│                │ CANCEL    ROTATE KEY │
└────────────────┘                └──────────────────────┘

M7 (add installation — auto-discover)        M10 (remove installation)
┌──────────────────────────┐                  ┌──────────────────────┐
│ Pick an installation     │                  │ DESTRUCTIVE          │
├──────────────────────────┤                  │ Remove AcmeBooks      │
│ discovered via /api/...  │                  ├──────────────────────┤
│ ✓ DesignKitchen 7 repos  │                  │ WHAT HAPPENS         │
│ ☐ AcmeBooks              │                  │ │BREAK│ ACME_GH_TOKEN  │
│   already wired ●WIRED   │                  │       unset          │
│ ☐ AcmeShop          │                  │ │BREAK│ mcp__github- │
│   already wired ●WIRED   │                  │       app-fnlivros__*│
│ ☐ Flavia-Nasser-OMS    │                  │       removed        │
│   already wired ●WIRED   │                  │ │KEEP │ App creds    │
│ ☐ chatdesk-brasil       │                  │       3 other inst   │
│   already wired ●WIRED   │                  │       unaffected     │
│                          │                  │                      │
│ WILL CREATE              │                  │ TYPE AcmeBooks TO     │
│ slug    github-app-...   │                  │ CONFIRM              │
│ env_var DESIGNKITCHEN... │                  │ │ AcmeBooks       │   │
│                          │                  │                      │
│ ✓ reachable · 51 tools   │                  │ CANCEL  REMOVE       │
│                          │                  │         INSTALLATION │
│ CANCEL TEST  ADD 1 INST  │                  └──────────────────────┘
└──────────────────────────┘
```

## OSS-readiness checklist (verified across all 6 specs)

✅ Zero hardcoded operator-specific values em production code paths
   - Test fixtures use `Acme Corp`, `mcp__example__*`, `12345`
✅ All UI labels parametrized from data (`connector_apps.app_name`, `app_slug`, etc.)
✅ Yaml editing not required for day-2 ops (only one-time install of approvals.owner_slack_user_id)
✅ Drag-drop file upload (modern UX expectation)
✅ Live match-preview before saving rules (no surprise consequences)
✅ Type-to-confirm for destructive ops (matches GitHub pattern)
✅ Auto-discover via GitHub API (no manual ID entry)
✅ Cascade cleanup (removing installation auto-removes related approval rules + env vars)
✅ Comprehensive test coverage (unit + integration + `@live` GitHub API)
✅ Clean error messages with actionable guidance ("Migrate to DB-managed rules in /settings")

## Implementation order

```
0043 (visual design — Paper)
   ↓
0044 (backend foundation — schema, mutations, packages/github-app/)
   ↓
0045 (install + listing + detail UI — M6, C7, C8, C10)
   ↓
0046 (lifecycle modais — M7-M12)
   ↓
0047 (always_sensitive in DB — orthogonal to lifecycle, can ship in parallel)
   ↓
0048 (polish round — bundles 7 small items)
```

Single feature branch (e.g., `feat/github-app-v2`) with multiple commits per spec is the recommended approach. PR can be split if review burden too heavy.

## Total scope

- **6 specs** approved with 3 clean review rounds each
- **10 Paper artboards** + 1 new (M12 in 0046)
- **3 SQLite migrations** (id 6, 7, 8 — exact ids assigned at impl time)
- **1 new workspace package** (`packages/github-app/`)
- **5 surgical mutations** on `GitHubAppAuth`
- **6 new API endpoints** under `/api/connectors/catalog/github-app/`
- **1 new API endpoint** for App detail (`/api/connectors/apps/:appId`)
- **1 new API endpoint** family for `/api/approval-rules`
- **6 lifecycle modals** (M7-M12)
- **2 new dashboard pages** (App detail C8 + per-install C10 reuses connector pattern)
- **Estimated implementation effort**: 2-3 weeks for one developer, 1 week for parallel pairs.

---

After all 6 ship, the Zeno dashboard is **the** GitHub App management surface. Yaml edits required only at install time (and only for `approvals.owner_slack_user_id` and friends — not connector data). Day-2 ops are 100% dashboard. OSS users clone the repo, run `docker:up`, browser to localhost:3000, point and click.
