---
status: draft
feature: connectors-cli-first-design
created: 2026-05-08
shipped: null
---
# Connectors CLI-First Rework — Design Spec

**Status:** Draft
**Scope:** Define the dashboard UI/UX and routing model for the connectors surface as 6 new artboards in the existing Paper file (`zeno-agent`, `01KPYCJ6QXK8Z1PEVQME9262RP`, page `1-0`). Lock the product decisions that drive the rework: N-instances per connector, dashboard read-only, CLI as the only mutation path. Visual deliverable + decision capture. Implementation belongs to a follow-up spec written after the artboards are approved.

## Brainstorm Q&A

This spec was born out of a manually invoked `/brainstorming` session where the operator answered each question explicitly. Decisions below are locked unless re-opened in writing.

### Q1 — Scope of the read-only barrier on the dashboard

**Decision: A — 100% CLI-only.** Every connector mutation passes through the `zeno` CLI: create, enable, disable, delete, edit secrets, reveal a secret, refresh tools, test connection, set per-tool permission, set bulk permission per category, install/manage custom connectors. The dashboard is purely a display surface; every action button opens a `CommandModal` with the exact CLI command the operator must run.

**Reasons:** "one way to do things" mantra. Disciplined surface beats divergence. Education is implicit — operators learn the CLI by using it.

**Trade-off accepted:** more friction for one-off tweaks (e.g. revealing a secret requires running a command, not clicking a button). Acceptable because Zeno is single-user and deeply hands-on; operators are technical.

### Q2 — Visual: github-app `app` pattern vs new plain `connector_group`

**Decision: ConnectorGroupCard — single padronized component.** One card skeleton serves both data models. Header carries catalog identity (icon + name); a conditional "identity slot" inside the card holds parent metadata when present (e.g. `app_id` + PEM fingerprint for github-app). Drill body lists the leaf rows (instances or installations).

**Reasons:** the operator already may have several github-app-shaped catalogs in the future; consistency now beats two parallel visual languages. Schema stays as-is (two patterns: `app` via `connector_apps`, `plain` flat — see spec 0044/0045 for github-app's existing data model). Visual is unified, data model stays honest.

**Trade-off accepted:** card has a conditional slot — adds one branch to the component, but it's a single render concern.

### Q3 — Anatomy of `CommandModal`

**Decision: M — minimal modal.** ~80px tall. Contents: title (action label), the exact CLI command (monospaced single block), `[Copy]` button, `[Docs ↗]` link. Nothing else — no `why this command` blurb, no `next steps`, no inline secret prompt explanation.

**Reasons:** purist CLI-first. The CLI itself handles prompts and feedback once the operator runs it. Modal is not a tutorial; it is a launcher.

**Trade-off accepted:** new operators may need to read external docs to understand context. Acceptable — the docs link is one click away.

### Q4 — Naming convention for multi-instance display

**Decision: F — separate fields.** New column `connectors.instance_label` stores the operator-supplied human label (e.g. `"Acme workspace"`). `connectors.display_name` continues to hold the catalog name (e.g. `"Linear"`) for catalog rows. UI renders `{display_name}` in the catalog/group header and `{instance_label}` per drill row. Custom connectors keep `display_name` operator-controlled and `instance_label` null.

**Reasons:** separates catalog identity from operator-supplied identity. Editing label is a `UPDATE instance_label` that does not touch the composed string. Backward-compatible: existing rows copy their catalog name into `display_name` and have `instance_label = null`.

**Trade-off accepted:** one extra column. Cheap.

### Q5 — Catalog grid behavior post-install

**Decision: C1 — counter visible.** Each catalog card in the catalog modal shows `"Linear · 3 installed"` and a `+` action button to install another. When `multiInstance: false` is declared on the catalog entry and `count >= 1`, the `+` button is disabled with a tooltip `"Already installed (single-instance)"`. Default for `multiInstance` is `true`.

**Reasons:** counter is cheap and gives the operator instant context. Always-visible `+` honors multi-instance without ruido. Single-instance catalogs (e.g. `playwright`) opt out at the catalog level.

**Trade-off accepted:** the catalog card carries one more piece of data. Trivial.

### Q6 — Routing / drill model

**Decision: uniform routes; 2 levels for plain, 3 levels for app pattern.**

```
/connectors                              # index — ConnectorGroupCard per catalog
/connectors/:catalogId                   # leaves list (plain: instances, app: Apps)
/connectors/:catalogId/:id               # detail page (always exists)
                                         #   plain: instance detail
                                         #   app: App detail (rich, lists installations inside)
/connectors/:catalogId/:appId/instances/:id   # app installation detail (third level only)
/connectors/custom                       # list of all custom connectors as leaves
/connectors/custom/:id                   # custom detail (treats `custom` as a pseudo-catalog)
```

**Reasons:** every drill terminator is a route — instance details and installation details get full pages, not drawers. Breadcrumb is explicit at every level. App pattern earns its third level because the App is itself a meaningful entity (PEM, app id, slug).

**Trade-off accepted:** app pattern has more URL depth. Honest reflection of the data tree.

### Q7 — Naming for the third-level segment

**Decision: N2 — generic segment `instances/`.** The literal URL segment is `instances`. UI text is free per catalog (`"Installations"` for github-app today; future apps may show `"Tenants"`, `"Members"`, etc.). The URL stays neutral; display naming is a catalog property.

**Reasons:** avoids leaking github-app vocabulary into the URL contract. New app-pattern catalogs slot in without renaming.

**Trade-off accepted:** the URL says `instances` even when the UI calls it `Installations`. Acceptable separation.

### Q8 — Layout of the index page `/connectors`

**Decision: L4 — catalog opens in a modal triggered by a `[Browse Catalog]` button on the index header.** The index body lists only `ConnectorGroupCard` rows for installed catalogs. The catalog browser is a separate overlay that the operator invokes on demand.

**Reasons:** matches the Anthropic Directory pattern (familiar to the operator). Index stays focused on installed state. Catalog is on-demand discovery, not a permanent sidebar of choices. Empty state of the index becomes a clear "Browse Catalog" CTA.

**Trade-off accepted:** first-time discovery requires one click (the button). Acceptable; the empty state CTA makes it obvious.

### Q9 — Click behavior inside the catalog modal

**Decision: K1 — `+` opens `CommandModal` inline; card body opens external docs.** Each catalog card has a `+` action button. Clicking `+` opens a `CommandModal` (rendered as a popover/dialog over the catalog modal) with the install command. The catalog modal stays open underneath. Clicking the card body anywhere else opens the catalog entry's `docsUrl` in a new browser tab.

**Reasons:** matches the Directory affordance. Browsing is a comparison activity — closing the catalog every install ruins it. Two distinct gestures (`+` vs body) reduce ambiguity.

**Trade-off accepted:** modal-on-modal stack. Reasonable because the inner modal is small (~80px) and reads as a popover, not a competing surface.

## Context

Connectors are the product per `vault/constitution.md`. Today the system technically supports multiple instances of the same catalog entry via `resolveSlugCollision` (`apps/api/src/routes/connectors.ts:82-92`), but the dashboard catalog grid blocks repeat installs by treating `isInstalled: bool` as the gating signal. Only the github-app pattern truly supports N children today, via the dedicated `connector_apps` table introduced in spec 0044.

The current dashboard surfaces 3 routes (`/connectors`, `/connectors/:id`, `/connectors/github-app`) that mix two visual languages: the github-app App pattern (rich detail) and the plain catalog pattern (one-row-per-install, full-CRUD inline). With the operator's explicit goal of a CLI-first surface — `zeno connector install`, `zeno connector secret set`, etc. — the dashboard's role contracts to display, and the visual model needs to converge.

In parallel, issue [#44](https://github.com/ribeirogab/zeno-agent/issues/44) is in flight to migrate `packages/storage` to drizzle. This spec deliberately describes the data model in shape rather than import paths so the design holds across that migration.

## Problem Statement

Three concrete gaps:

1. **Multi-instance is partial.** `resolveSlugCollision` allows it at the API but the dashboard catalog grid (`/connectors` index) gates installs on a boolean `isInstalled`. Operators cannot register a second Linear, Sentry, etc. without going around the dashboard. There is no field to label instances meaningfully (`instance_label` does not exist).
2. **Two visual languages.** The github-app App pattern and the plain connector pattern look and behave differently. With multi-instance support landing for plain catalogs, the visual gap will widen unless the dashboard converges on one component model.
3. **Mutations live in two places.** Secrets editing, per-tool permission, install/uninstall — all are doable from the dashboard today. The operator wants the CLI to own all mutations and the dashboard to display only.

## Non-Goals

1. **Code.** No React components, no API endpoint changes, no DB migrations, no CLI command implementations. This spec is Paper artboards + this document only.
2. **CLI command implementation surface.** A follow-up spec will lay out the exact `zeno connector` subcommand tree, flags, and prompts. This spec only mentions which actions exist (so the `CommandModal` knows what to display).
3. **`packages/storage` → drizzle migration.** Out of scope; tracked by issue [#44](https://github.com/ribeirogab/zeno-agent/issues/44). The data-model fields named here (`instance_label`, etc.) describe shape; the implementation spec will land them in whichever schema layer is canonical at that point.
4. **Channels.** `connectors.kind = 'channel'` rows (Slack, future Telegram/WhatsApp) are out of scope. They live under `/channels`, not `/connectors`.
5. **Skill linking** (`connector_skills`) and **cron linking** (`cron_connectors`). Existing relationships unchanged; their UI on the connector detail page remains, just rendered read-only.
6. **Custom-connector creation flow.** Custom connectors continue to exist (`source = custom`); the design must accommodate them in the URL scheme, but defining the `zeno connector custom create` command and its prompts is the implementation spec's job.
7. **Auth on the dashboard.** Issue [#45](https://github.com/ribeirogab/zeno-agent/issues/45) (production-grade auth) is parallel; this spec assumes the existing localhost-bound trust model.

## Constraints

- **Single source of truth — Paper.** All visual decisions live in the artboards. This document is the textual lockdown of decisions and acceptance criteria.
- **Existing Paper foundations stay.** Use the design system already on canvas (palette, typography, spacing, primitives). No new foundations or new primitives unless one is unavoidable, in which case the spec calls it out as an open question.
- **English-only documentation.** Per `vault/rules/`, all vault content (this spec included) is English.
- **Two data patterns coexist.** The schema retains `connector_apps` (App pattern, github-app today) and the flat `connectors` table grouped by `catalog_id` (plain pattern). The visual layer unifies; the schema does not.
- **Catalog-driven configuration.** Multi-instance opt-in (`multiInstance: bool`), install pattern (`installPattern: 'app' | 'plain'`), and any UI text overrides (e.g. "Installations" vs "Tenants") are catalog entry fields, not branched code.
- **Server-enforced read-only.** A feature flag `ZENO_API_WRITES = cli | dashboard` (default `cli`) blocks mutating endpoints with HTTP 403 when set to `cli`. The dashboard reads `GET /api/mode` to decide whether to render `CommandModal` or live-action buttons. (Implementation belongs to the follow-up spec; this design assumes the endpoint exists.)
- **Async mutation feedback.** CLI mutations enqueue a command and return a `correlationId`. The CLI polls `GET /api/commands/:correlationId` until terminal status (`success` / `failed`) so the operator sees a single-shot synchronous experience even though the worker handles the work async. The endpoint is assumed to exist; implementation belongs to the follow-up spec.

## User Stories / Scenarios

Each scenario below is a Paper artboard target.

### S1 — Operator opens `/connectors` for the first time (empty state)

The body has zero `ConnectorGroupCard` rows. A centered empty state explains "No connectors installed" and invites `[Browse Catalog]`. Header still carries the same `[Browse Catalog]` button as the populated state.

### S2 — Operator browses the catalog modal

Click `[Browse Catalog]`. A modal slides over `/connectors` with: search input, filter/sort placeholders (deferred behavior), a grid of catalog cards. Each card shows: icon, catalog name, short description, `"N installed"` counter (or `"Available"` if `count = 0`), and a `+` action button. `multiInstance: false` catalogs at `count >= 1` show the `+` disabled with a tooltip.

### S3 — Operator copies an install command

In the catalog modal (S2), click `+` on the Linear card. A `CommandModal` opens as a popover: title `"Install Linear"`, command `zeno connector install linear --label "<your-label>"`, `[Copy]` and `[Docs ↗]` buttons. Catalog modal stays underneath. Closing the popover keeps the operator on the catalog modal.

### S4 — Operator views one Linear instance among many

Three Linear instances installed. `/connectors` shows one `ConnectorGroupCard` for Linear with `"3 instances"` and three drill rows (Acme, Personal, Side-project) with status pills. Click "Acme" → navigates to `/connectors/linear/<uuid-acme>`.

### S5 — Operator inspects a Linear instance detail page (plain pattern)

`/connectors/linear/<uuid-acme>` shows: header (Linear icon + `display_name` + `instance_label`), status block (enabled/disabled, last verified, last error, action buttons → `CommandModal` for `enable`/`disable`/`uninstall`/`test`/`refresh-tools`), secrets table (key, masked value, `[Reveal]` button → `CommandModal`), tools table (name, category, permission badge, per-row `[Edit]` button → `CommandModal`), and an activity log section.

### S6 — Operator inspects the GitHub App detail page (app pattern)

`/connectors/github-app/<app-uuid>` shows the rich App header (icon + app name + app slug + app id + PEM `sha256:` fingerprint + `[Uninstall App]` action button → `CommandModal`), an `installations` block listing the App's children with their status, and a `[Discover installations]` action button → `CommandModal` for `zeno connector app installations discover`.

### S7 — Operator drills into a single GitHub App installation

`/connectors/github-app/<app-uuid>/instances/<installation-uuid>` shows the same skeleton as S5 (status, secrets, tools, activity) for the installation. Breadcrumb: `Connectors / GitHub App / <App Name> / <Installation Name>`. UI text uses "Installation" because `github-app`'s catalog entry declares it; URL still says `instances`.

### S8 — Operator on a single-instance catalog (e.g. Playwright)

`/connectors/playwright` shows the lone Playwright row. The catalog modal's `+` for Playwright is disabled. Detail page (`/connectors/playwright/<uuid>`) renders normally.

### S9 — Custom connectors (deferred artboard)

`/connectors/custom` and `/connectors/custom/:id` are reserved in the URL scheme but **no artboard is drawn for them in this design phase**. Operators with custom connectors will see a render that reuses the plain leaf list / detail skeleton from S4–S5 with `display_name` shown as-is and `instance_label` null. Locking the visual treatment for custom is deferred to the follow-up implementation spec, where custom-creation prompts in the CLI are also defined.

## Acceptance Criteria

These criteria are observable on the **Paper artboards** (visual deliverable) and on this **spec document** (decision lockdown). Implementation criteria are deferred to the follow-up spec.

### Decisions captured

- [ ] All 9 brainstorm decisions (Q1–Q9) are present verbatim in this spec.
- [ ] Each decision states the chosen option, the reason, and the trade-off accepted.
- [ ] No decision contains a `[NEEDS CLARIFICATION: …]` marker.

### Paper artboards delivered

The following 6 artboards exist in the Paper file `zeno-agent` (`01KPYCJ6QXK8Z1PEVQME9262RP`, page `1-0`) and are linked by node id in this spec's `artboards/` companion notes:

- [ ] **A1 — `/connectors` index** with: header `[Browse Catalog]` button, `ConnectorGroupCard` rows for installed catalogs, empty state when zero installed (per S1).
- [ ] **A2 — Catalog modal overlay** with: search input, filter/sort placeholders, grid of catalog cards each showing icon + name + description + `"N installed"` counter + `+` button (per S2). At least one card shows the `multiInstance: false` disabled `+` state.
- [ ] **A3 — `CommandModal` (reusable popover)** showing: title, monospaced command line, `[Copy]`, `[Docs ↗]` (per S3). Single artboard; the modal renders in catalog-overlay context and in detail-page context.
- [ ] **A4 — `/connectors/:catalogId` (plain leaves list)** for the Linear example with three rows: Acme, Personal, Side-project (per S4). Includes the `ConnectorGroupCard` skeleton with status pills per row.
- [ ] **A5 — `/connectors/:catalogId/:id` (plain detail)** for the Acme Linear instance with: header, status block + action buttons, secrets table with `[Reveal]`, tools table with per-row `[Edit]`, activity log (per S5).
- [ ] **A6 — `/connectors/:catalogId/:id` (app detail) and `/connectors/:catalogId/:appId/instances/:id` (app installation detail)** as two artboards covering S6 and S7. Counts as one acceptance line because both artboards reuse the same skeleton (S5) plus app-specific header.

### Each artboard meets the project's UI bar

- [ ] Every artboard uses only the design system primitives present in the Paper file. Any new primitive is listed under "Open Questions" with a justification.
- [ ] Every action button on every artboard maps to a single `CommandModal` invocation (no buttons that would mutate state).
- [ ] Every status pill follows the existing `enabled / disabled / pending / error` palette already on canvas.
- [ ] The `multiInstance: false + count >= 1` disabled state appears on at least one artboard with a visible tooltip example.
- [ ] Breadcrumb on detail/installation pages renders the catalog-specific UI text (`"Installations"` for github-app), not the URL segment (`instances`).

### Decisions enforce server-side, not just UI

- [ ] The spec calls out that `ZENO_API_WRITES = cli` blocks mutations at the API. The dashboard reading `GET /api/mode` is described.
- [ ] The follow-up implementation spec is referenced by name (placeholder) at the bottom of this document so the next pickup is unambiguous.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| **Issue [#44](https://github.com/ribeirogab/zeno-agent/issues/44) (drizzle migration) lands mid-flight and renames `packages/storage`.** | This spec talks shape, not import paths. Acceptance criteria here are visual. The follow-up implementation spec will rebase on the prevailing storage layer at the time it is written. |
| **CLI-first feels too friction-heavy in real use** (e.g. revealing a single secret takes a copy-paste cycle every time). | Acknowledged in Q1 as a deliberate trade-off. If experience shows it is unworkable, a follow-up spec can flip `ZENO_API_WRITES` defaults or open targeted exceptions. The flag exists precisely to make the policy reversible. |
| **`multiInstance: false` enforcement bypassed by direct API calls.** | The flag-gated API is the canonical write surface. CLI will hit the API; if `multiInstance: false`, the API rejects with HTTP 409 (implementation spec defines the response shape). The disabled `+` is a UX courtesy, not the gate. |
| **Two visual patterns (`app` vs `plain`) drift over time.** | `ConnectorGroupCard` is a single component with a conditional identity slot. Drift requires explicitly forking the component, which a code review would catch. |
| **`instance_label` migrations break old rows.** | New column is nullable. Existing rows keep `display_name = "Linear"` and `instance_label = null`. The dashboard renders the catalog name for null labels, preserving backward visual compat. |
| **Catalog modal-over-modal stack feels claustrophobic.** | `CommandModal` is intentionally minimal (~80px) and renders as a popover, not a peer modal. Visual review at artboard time is the gate. |

## Open Questions

- [NEEDS CLARIFICATION: visual treatment of the `App` identity slot inside `ConnectorGroupCard`.] The skeleton rule is "header + optional identity slot + drill list", but the exact PEM-fingerprint visual (mono caption? badge? tooltip?) is decided at artboard time, not in this spec.
- [NEEDS CLARIFICATION: status aggregate visualization on the index `ConnectorGroupCard`.] When N>1, does the card show one aggregated pill (`"3 enabled"`), individual pills per drill row (today's behavior on github-app), or both?
- [NEEDS CLARIFICATION: empty state copy and CTA wording.] Lock the strings at artboard time.

## Follow-up implementation spec

After Paper approval, the next spec (placeholder slug `connectors-cli-first-impl`) will cover:

- Schema migration (add `instance_label`, drop `isInstalled` semantics).
- API endpoints (`GET /api/mode`, `GET /api/commands/:correlationId`, `connector_group` list shape).
- Feature flag `ZENO_API_WRITES`.
- Full `zeno connector` CLI subtree (commands, flags, prompts), including custom-connector creation flow.
- Dashboard updates (read-only mode, `CommandModal` component, route updates).
- Custom connector artboard (`/connectors/custom`, `/connectors/custom/:id`) — visual locked at implementation time, reusing the plain leaf skeleton.
- Migration of existing dashboard buttons.
- Decision on which existing artboards from specs 0034 / 0042 / 0044 (Connectors UI C1–C6, github-app M-series) are archived as historical references vs. superseded inline.
