---
status: design-only
feature: connectors-ui
created: 2026-04-25
shipped: null
---
# Connectors UI — Spec (design-only, no implementation)

**Status:** Design-only
**Scope:** A behavior spec for a new dashboard surface that lets the operator connect Zeno to external tools (MCP servers) entirely through the UI, with no manual file editing. Defines information architecture, lifecycle, states, flows, and data semantics. Does **not** define visual layout — that is the design agent's job, downstream. Does **not** define implementation — a separate spec will plan the build.

## Context

Zeno talks to external tools via MCP servers. Today they live in `profiles/<name>/mcp.json` (stdio command + args + env vars), with secrets resolved from `profiles/<name>/.env`. Adding a connector means editing two text files and restarting the container. That's friction the operator (single user) can absorb but doesn't want to — and it blocks the goal of running Zeno end-to-end without touching code.

The reference UX is Claude Desktop's *Directory* (Skills | Connectors | Plugins) and its *Add custom connector* modal. Zeno borrows the **conceptual model** (catalog of curated integrations + escape hatch for custom servers, per-tool permission matrix) but adapts it to a single-user, profile-scoped, locally-running agent.

This spec covers **only Connectors**. Skills management UI is deliberately deferred.

## Problem Statement

The operator needs to add, configure, test, enable/disable, inspect, and remove MCP connectors fully through the dashboard, without editing any file in the profile or restarting the worker. They need to see — without leaving the UI — whether each connector is healthy, which tools it exposes, and which tools the agent is allowed to invoke without confirmation.

## Non-Goals

1. **Skills management UI.** Out of scope; deferred to a future spec.
2. **Plugins.** Not a concept in Zeno today; not introduced here.
3. **Crons UI.** Already shipped at `/crons`; untouched.
4. **Tool permission category override** (manually moving a tool from Read-only to Write/delete). Categorization comes from the catalog or heuristic; the user adjusts permission per tool, not group membership.
5. **Live periodic health-check.** Status updates reactively (manual test + runtime errors); no background pinger.
6. **Dynamic / remote catalog.** Catalog is a static JSON in the repo; updates via PR.
7. **Per-turn permission granularity** (allow once, allow for session). Only a global 3-state per tool (`always_allow` / `ask` / `never`).
8. **Auto-import from `mcp.json`** or any other source. Migration is a manual hard cutover (see §Migration).
9. **OAuth flow orchestration** for remote connectors. The operator pastes pre-obtained tokens; the UI does not run an OAuth dance.
10. **Encryption-at-rest** of secrets in the DB. Single-user local context; deferred.
11. **Connector config versioning / rollback.** Last write wins.
12. **Reorderable list** (drag-drop). List sorted by creation order, MVP.
13. **Multi-tenant / per-user isolation.** Connectors are per-profile. There is no concept of "this user can manage these connectors but not those".

## Constraints

- **Profile-scoped.** Each profile has its own connectors; nothing is shared between profiles. The catalog (the data source) is shared across all profiles.
- **DB-first.** Connectors and their secrets live in the DB managed by `@zeno/storage`. The `.env` file is reserved for bootstrap/runtime infrastructure (Slack tokens, Claude OAuth token, dashboard password, log level, workspace dir) — not for connector secrets. The `mcp.json` file is no longer read by the loader after this feature ships.
- **Two transports must be representable: `stdio` and `remote`.** The UI must distinguish them visually and support both in the add/edit flows. Runtime support for `remote` may require an implementation-spec follow-up; the design must account for it regardless.
- **Locked design system from spec 0008** (warm-dark canvas, single coral accent per screen, Instrument Serif headlines, Inter body, 4/8/12/16/24/32/48/64 spacing, `info on surfaces, not in containers` for dense lists). The design agent inherits these rules — this spec does not redefine them.
- **No backend implementation in this spec.** Data shapes described below are *conceptual* — they tell the design agent what the UI needs to surface. The implementation spec will translate them into tables, API endpoints, and code.
- **Tool-invocation logs must carry a stable connector reference** (whether by id or by a derivable convention like `mcp__<connector_slug>__<tool_name>`). This is a precondition for the Activity section's `View turn` deep-link and the `Open full logs` filter to function. The implementation spec must guarantee this carry; the design agent assumes it works.

## Information Architecture

A new top-level destination `/connectors` is added to the sidebar (sibling of Home, Crons, Sessions, Logs, Settings). It has two screens:

### List screen (`/connectors`)

The list screen shows two logical content areas, both always present:

- **Installed connectors.** All connectors persisted in the active profile's DB. For each: icon, name, transport (`stdio` / `remote`), status (`enabled` / `disabled` / `error` / `pending`), and the timestamp of the last verification (`last_verified_at`). When `last_verified_at` is null — which is the case for any `pending` connector that has never had a successful test — the row shows the literal string `Never tested` instead of a timestamp. Non-pending connectors always have a non-null `last_verified_at`. Primary affordance navigates to the detail screen; secondary affordance is a per-row menu (`Test connection`, `Enable` / `Disable`, `Uninstall`).
- **Add a connector.** Catalog cards (curated entries) plus an explicit `Add custom` action. Catalog cards show name, short description, transport, and a `Learn more` link to docs. Catalog entries that are already installed are visually marked as installed and not actionable for a second install.

**Empty state:** when there are no installed connectors, the *Installed* area collapses and the *Add a connector* area occupies the page with light onboarding copy ("Connect Zeno to external tools").

### Detail screen (`/connectors/:id`)

Detail shows everything about a single installed connector. It is composed of four sections:

1. **Header.** Icon, name, transport pill, status pill, enable/disable toggle, breadcrumb back to the list, kebab menu with `Test connection`, `Refresh tools`, and `Uninstall` (destructive — requires confirmation).
2. **Connection.** The current config (URL for `remote`; command + args for `stdio`) and credentials (env var pairs). Always shows a `Test connection` button.
3. **Tool permissions.** Tools grouped by category, each group with a bulk action and per-tool overrides.
4. **Activity.** A read-only feed of the most recent tool invocations by the agent against this connector.

Each section is detailed below.

## Catalog Model

The catalog is a static JSON file in the repo at `agent/connectors-catalog.json`, versioned in git, loaded by the dashboard at runtime. It is shared across profiles. Updating it is a PR. The catalog is informative for installs but is not the source of truth for installed connectors — once a connector is installed, its config lives in the DB and is independent from the catalog.

### Conceptual entry shape

A catalog entry describes a *recommended* configuration for a known external tool:

- **`id`** — stable slug (e.g., `linear`). Used to detect "already installed" in the list and to derive the icon path.
- **`name`** — display name (e.g., `Linear`).
- **`description`** — one or two lines (e.g., "Issues, projects, cycles.").
- **`icon`** — reference to an SVG asset shipped under `agent/assets/connectors/<id>.svg`.
- **`docs_url`** — link rendered as `Learn more` in the install modal and as the external link in the detail header.
- **`transport`** — `stdio` or `remote`.
- **`transport_config`** — depends on transport:
  - `stdio`: `command` and `args` template (may reference `${SECRET_KEY}` placeholders that resolve at runtime).
  - `remote`: `url` template (same placeholder rules).
- **`secrets`** — ordered list of expected secret fields. Each: `key` (env var name, e.g., `LINEAR_API_KEY`), `label` (display, e.g., `Linear API Key`), `help` (one-line instruction, e.g., `Get one at linear.app/settings/api`), `required` (boolean).
- **`tools`** — list of tools the connector exposes. Each: `name` (e.g., `create_issue`), `description` (one line), `category` (`read` / `write` / `interactive`), `default_permission` (`always_allow` / `ask` / `never`).
- **`tags`** — optional list of free-form labels reserved for future filter UI; not surfaced in MVP.

### Initial catalog (8 entries)

`linear`, `notion`, `granola`, `sentry`, `github`, `slack`, `google-drive`, `cloudflare`. Eight is a comfortable launch set; growth beyond ~20 entries triggers pagination/search inside the catalog area, but that is not required at MVP.

### Custom connectors (off-catalog)

When a user adds a custom connector:

- The form collects: name (free text → derives a slug), transport (`remote` or `stdio`), config (URL or command/args), and a free-form list of `key/value` env var pairs (added/removed dynamically; values masked).
- Tools are not declared up-front — they are **discovered** during a successful test-connection (the MCP returns its tool list when initialized).
- Discovered tools are **classified by name heuristic**: prefixes `read_`, `list_`, `get_`, `search_`, `find_` → `read`; prefixes `create_`, `update_`, `delete_`, `send_`, `post_`, `put_` → `write`; everything else → `interactive`.
- **Default permissions per discovered category:** `read` → `always_allow`; `write` → `ask`; `interactive` → `ask`. The user adjusts per tool afterwards.
- The icon falls back to a neutral placeholder (e.g., a coral square with the slug's first letter, or a generic plug glyph — design agent decides the exact treatment).

### Slug collision

If a user creates a custom connector whose derived slug collides with an existing connector in the same profile, the persisted slug is suffixed with `-2`, `-3`, etc. The display name remains as the user typed it.

## Lifecycle and States

### States

A connector record has a status that drives UI representation:

- **`pending`** — applies only to custom connectors that were saved without a successful test-connection. Catalog installs and custom installs that ran a successful test never enter `pending`.
- **`enabled` (healthy)** — active. The agent may invoke its tools. Last verification (test or runtime) succeeded.
- **`enabled` (with error)** — active, but the most recent attempt to use the connector failed (e.g., `401 Unauthorized`, `connection refused`, expired token). The UI surfaces the error prominently but **does not auto-disable**; the operator decides.
- **`disabled`** — the operator toggled it off. The agent does not see the tools. Configuration and tool permissions are preserved.

Each connector also stores a `last_error` (string + timestamp) and a `last_verified_at` (timestamp of the last successful initialization or test).

### Transitions

- **Install via catalog** — credentials must validate; on success → `enabled`.
- **Install custom with successful test** → `enabled`.
- **Install custom without test** → `pending`.
- **Test connection succeeds** — clears `last_error`. Moves `pending` → `enabled`. Moves `enabled (with error)` → `enabled (healthy)`.
- **Test connection fails** — sets `last_error`. Status does not regress; `enabled (healthy)` becomes `enabled (with error)`; `pending` stays `pending`.
- **Toggle off** — `enabled` → `disabled`.
- **Toggle on** — `disabled` → `enabled`. Optionally triggers a test in the background.
- **Edit credentials and save** — persists, then triggers a test automatically; status follows the test-result rules.
- **Uninstall** — removes the connector record and its associated secrets and tool-permission rows from the DB. Irreversible; requires confirmation.
- **Runtime error** (the agent tried to use a tool and the call failed at the transport/auth layer) — sets `last_error` and updates the UI reactively. Does **not** flip the toggle.

### Visual indicators the design must represent

The design agent must find treatments for these distinctions; this spec lists what must be distinguishable, not how:

1. Status: `enabled (healthy)` vs `enabled (with error)` vs `disabled` vs `pending`.
2. The difference between an **install/test error** (config wrong — surfaced near the connection form) and a **runtime error** (auth expired during use — surfaced as a banner on the card and in the detail header).
3. The `Test connection` affordance must always be present in the detail header — it does not disappear when the connector is healthy.

### Error display

Errors shown to the user are the original transport / MCP message (e.g., `401 Unauthorized`, `connection refused`, `command not found: npx`) plus a timestamp. When an error category can be inferred, an inline hint is added (e.g., `check your API key`, `check the URL is reachable`). The full stack trace is not shown — `Open full logs` deep-links to `/logs` filtered by this connector.

## Add Flows

### Add via catalog

1. The user clicks a catalog card that is not yet installed.
2. A modal opens, titled `Add <Connector Name>`. It contains: header (icon, name, transport pill, `Learn more` link), description, a form with **only the secrets declared by the catalog entry** (each rendered with its `label` and `help`; sensitive fields masked), a `Test connection` button (secondary), an `Add` button (primary), and `Cancel`.
3. `Test connection` validates the credentials by initializing the MCP server with the catalog's `transport_config` interpolated against the entered secrets. It does not persist anything. On success it shows `✓` plus the count of tools detected (which should match the catalog's declared list); on failure it shows `✗` plus the underlying error.
4. The `Add` button is disabled until at least one successful test has run in the current modal session against the **currently entered values**. Editing any field after a successful test re-disables `Add` until the next successful test against the new values. This prevents installing with stale-but-tested credentials when the user changed something afterwards.
5. `Add` persists the connector to the DB with: catalog-resolved `transport_config`, the entered secrets, the catalog's tool list, the catalog's `default_permission` per tool. Initial status: `enabled`. Modal closes and the list updates.

### Add custom

1. The user clicks `Add custom` (an action sibling to the catalog cards).
2. A modal opens, titled `Add custom connector`. Fields: `Name` (free text), `Transport` (radio: `Remote URL` / `Local command`).
3. If `Remote`: a `URL` field, plus a collapsible `Advanced` section with `OAuth Client ID` and `OAuth Client Secret` (both optional, both masked).
4. If `Local`: a `Command` field (e.g., `npx`) and an `Args` field (editable list — chips or one-per-line textarea).
5. An `Environment variables` section with a `+ Add variable` action. Each row has `key` (free text) and `value` (masked input). Rows are removable.
6. `Test connection` (secondary) and `Add` (primary) and `Cancel`.
7. `Test connection` initializes the MCP, requests its tool list, applies the heuristic classification, and shows `✓ N tools (5 read · 2 write · 1 interactive)` or `✗ <error>`.
8. `Add` is **enabled at all times** — even without a successful test. Saving without a successful test creates a `pending` connector with no tools yet (tools will populate on the first successful test from the detail screen).
9. `Add` with a successful test creates an `enabled` connector with the discovered tools and default permissions per category.

### Common rules for both add flows

- The user may run `Test connection` arbitrarily many times. Each run is independent of the DB.
- Cancelling or closing the modal persists nothing.
- Test latency: spinner on the button until the transport resolves. No artificial timeout.

## Detail Screen Behavior

### Header

Icon, name, transport pill, status pill, enable/disable toggle (immediate effect), breadcrumb to the list, and a kebab menu with: `Test connection`, `Refresh tools`, `Uninstall` (confirmation modal). For catalog connectors, the name is read-only. For custom connectors, the name is editable inline (and the slug is **not** changed when the name is edited — the slug is fixed at install).

### Connection section

Renders the current config and allows editing:

- **Remote:** URL (editable). `Advanced` accordion with OAuth Client ID/Secret (masked, with reveal-temporary).
- **Stdio:** Command and Args (editable).
- **Environment variables:** list of key/value pairs. Each value is masked by default. An eye icon reveals the value for ~10 seconds and then re-masks. To change a value: clicking the edit affordance opens a fresh input that replaces the stored value on save (the user does not see the old value during edit — substitution rather than diff). Adding/removing variables is allowed only for **custom** connectors; **catalog** connectors freeze the set of `key` names declared in the catalog (the user can only change the values).
- **Catalog drift behavior:** if the catalog entry for an installed connector adds, removes, or renames a `key` in a later release, the installed connector is **not** retroactively migrated. It keeps the key set captured at install time. The detail screen does **not** show an "out-of-date" indicator for catalog drift in MVP. New installs use the latest catalog; existing installs stay frozen. The operator can uninstall and reinstall to pick up the latest template.
- A `Test connection` button is embedded in the section.
- A `Save` button is enabled only when the section has unsaved changes. Saving persists the new config and triggers a background test; the resulting status follows the test-transition rules.

### Tool permissions section

Tools are grouped by category (`Read-only`, `Write/delete`, `Interactive`). Each group has:

- A header with category name and tool count (e.g., `Read-only tools 8`).
- A bulk-action dropdown next to the header with three values: `Always allow`, `Ask`, `Never`. Choosing a value applies it to all tools in that group, overwriting their individual settings.
- An expandable list of tools. Each tool row shows: name, one-line description (from the catalog, or empty for custom), and an individual 3-state control with the same three values.

When a bulk action is set and the user later changes one tool individually, the bulk-action label becomes `Mixed` (informative, non-selectable). Selecting any of the three values from the bulk dropdown again re-applies it to all tools and clears `Mixed`.

**State variants of the section:**

- **Catalog connector, freshly installed** — tools, categories, and defaults come from the catalog and render immediately.
- **Custom connector, freshly installed with successful test** — discovered tools, classified by heuristic, with category defaults applied.
- **Custom connector in `pending`** — empty state: `No tools discovered yet. Run Test connection to discover tools.`
- **After `Refresh tools`** — the list is **replaced**, not merged. Tools removed by the MCP disappear; new tools enter with their category default permission. The user must confirm the refresh because individual overrides will be lost: `This will reset tool permissions to defaults.`

### Activity section

A read-only feed of the most recent **20** tool invocations of this connector by the agent, ordered newest first. Each row shows: timestamp (relative + absolute on hover), tool name, result (`✓` / `✗`), duration (ms), and a `View turn` link that deep-links into the relevant turn at `/sessions/:threadId`.

A footer link `Open full logs` navigates to `/logs` filtered by this connector.

## Migration / Cutover

A hard cutover. After the release that ships this feature:

- The MCP loader in the worker stops reading `mcp.json` from the profile. Connectors are sourced exclusively from the DB.
- On the first boot post-release, if the active profile has a non-empty `mcp.json`, the worker emits a single structured warning event (`mcp_json_ignored`) listing the server names found, plus the message: `MCP servers in mcp.json are no longer loaded. Re-add them via /connectors in the dashboard.`
- The file is **not** renamed, archived, or deleted. It stays on disk as a manual reference.
- The UI **does not** auto-import, **does not** display any badge tying connectors to `mcp.json`, and **does not** offer a one-shot migration action. The operator re-creates connectors via the catalog or `Add custom`.

This forces a one-time manual setup, accepted as a tradeoff for keeping the codepath single (DB-only) and avoiding a permanent legacy import path.

## Multi-profile

- Connectors are stored per profile in the active profile's DB; they are not shared across profiles. The same key (e.g., `LINEAR_API_KEY`) in two profiles holds two independent values.
- The dashboard shows the connectors of the profile bound to the active session. If a profile switcher is added later, switching the profile updates the list — no special behavior required from the connectors UI.
- The catalog (`agent/connectors-catalog.json`) is shared and read identically by every profile.

## User Stories / Scenarios

1. **First-time setup, catalog hit.** Operator opens `/connectors`, sees the catalog. Clicks `Linear`. Modal asks for `Linear API Key`. Operator pastes it, clicks `Test connection`, sees `✓ 12 tools detected`, clicks `Add`. Linear appears in *Installed* as `enabled`. The agent can now use Linear tools per the catalog defaults.
2. **First-time setup, custom remote.** Operator opens `/connectors`, clicks `Add custom`. Picks `Remote URL`, names it `FN Scrum`, pastes the URL, expands `Advanced` and pastes the OAuth Client Secret. Clicks `Test connection`, sees `✓ 8 tools (5 read · 3 write)`. Clicks `Add`. Connector lands as `enabled`.
3. **Auth expired in production.** The agent invokes a Linear tool; Linear returns `401`. The runtime sets `last_error` and the connector enters `enabled (with error)`. Operator opens the connector detail, sees the `401` plus a hint `check your API key`, clicks the eye on `LINEAR_API_KEY` to reveal — confirms it's stale — clicks edit, pastes a fresh key, clicks `Save`. Background test runs, succeeds, status returns to `enabled (healthy)`.
4. **Refreshing tools after upstream changes.** Notion adds a new tool. Operator opens Notion in the dashboard, clicks `Refresh tools` from the kebab menu. Confirmation: `This will reset tool permissions to defaults.` Operator confirms. The list updates; the new tool appears with its category default. Operator adjusts permissions as needed.
5. **Pause without losing config.** Operator wants to stop the agent from using Sentry temporarily. Toggles Sentry off in the detail header. Status flips to `disabled`. Tools disappear from the agent's available set. Config is preserved. Days later, toggle on; tools come back without re-entering anything.
6. **Removing a connector.** Operator opens the detail of an unused connector, clicks `Uninstall` from the kebab. Confirmation modal. Confirms. The connector and its secrets are removed from the DB. Returns to the list; the connector is gone.
7. **Migrating an existing setup.** Operator upgrades to the version that ships this feature. Worker boots, logs `mcp_json_ignored`. Operator opens `/connectors`, sees an empty state. Picks each previously-configured connector from the catalog (or adds custom for ones not in catalog), pastes the secrets they already have in `.env`, tests, adds. Done — the new state of truth is the DB.

## Success Criteria

1. The operator can complete each of the seven user stories above without editing any file in `profiles/<name>/` or restarting the worker.
2. The dashboard exposes a `/connectors` route with both the list and detail screens, accessible from the sidebar.
3. The list distinguishes the four statuses (`enabled (healthy)`, `enabled (with error)`, `disabled`, `pending`) at a glance.
4. The detail screen exposes all four sections (header, connection, tool permissions, activity) with the behaviors specified in §Detail Screen Behavior.
5. Catalog and custom add flows both produce a connector that the agent can immediately invoke (when status is `enabled`), with no extra setup step outside the modal.
6. `Refresh tools` replaces the tool list and resets per-tool overrides, after explicit confirmation.
7. After cutover, an existing `mcp.json` in a profile produces a single `mcp_json_ignored` warning at boot and is otherwise inert; the file remains intact on disk.
8. The design produced from this spec uses the locked design system from spec 0008 and respects the *one accent moment per screen* rule.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Hard cutover surprises an operator who upgrades and finds Zeno without connectors | The `mcp_json_ignored` boot warning lists the names; the empty-state copy on `/connectors` is explicit; release notes call out the cutover. |
| Heuristic categorization mis-labels a custom tool (e.g., a read-style name that mutates state) | Per-tool override exists; the default for `interactive` is `ask`, not `always_allow`, which limits blast radius. Catalog entries get hand-curated categorization. |
| `Refresh tools` silently wiping per-tool overrides | A confirmation modal warns before applying; refresh is explicitly user-initiated, never automatic. |
| Secret reveal leaves a value on screen during a screen-share | Reveal auto-hides after ~10 seconds; reveal is per-field, not bulk; no `Reveal all` action. |
| Catalog entries drift out of date (npm package renamed, hosted URL changed) | Catalog is JSON in git; updates are PRs. Already-installed connectors are not affected — only new installs use new templates. |
| Remote MCP support not yet implemented in the worker at design time | The design represents both transports regardless; the implementation spec must handle remote transport before this UI ships. Surfaced in §Open Questions. |
| Permission UI implies false sense of security (a `never` tool can still be invoked if bypassed) | The per-tool 3-state controls are a **new mechanism** that the implementation spec must wire into the existing approval pipeline (today driven by `profile/config.yaml`'s static `always_allowed_tools` / `always_sensitive` / `always_allowed_commands` lists). The pipeline integration is a hard requirement of the implementation spec — without it, this UI is cosmetic. The downstream design agent should treat these controls as load-bearing, not decorative. |

## Open Questions

These are non-blocking for the design spec; they will be resolved in the implementation spec.

1. **Spawn model for stdio MCPs after DB cutover.** Today the worker injects env vars from `process.env` when spawning. With DB-first, the loader must read each connector's secrets from the DB and inject them into the spawned subprocess at start time. The loader interface and refresh-on-edit semantics need to be designed.
2. **Remote MCP runtime support.** The Claude Agent SDK supports HTTP/SSE MCPs; Zeno's worker has not exercised that path yet. Whether to ship remote support in lockstep with this UI, or behind a feature flag, is an implementation question.
3. **Catalog growth ergonomics.** Eight initial entries fit comfortably without search or pagination. Growth to ~30+ requires a filter or search affordance inside the catalog area; the threshold is left to the implementation spec.
4. **Where icons come from for catalog entries.** The spec assumes SVG assets shipped at `agent/assets/connectors/<id>.svg`. Whether to fetch from a remote registry instead is out of scope here.
