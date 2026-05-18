---
status: draft
feature: apps-docs-content-rewrite
created: 2026-05-07
shipped: null
---
# Apps/Docs Content Rewrite — Spec

**Status:** Draft
**Scope:** Replace the three placeholder MDX pages in `apps/docs/content/docs/` with eleven real pages spread across three sidebar groups (Getting started, Concepts, Reference). Document only what Zeno ships today; do not mention deferred or roadmap features. The Connector catalogue page is generated at build time from `agent/connectors-catalog.json` so it stays in sync as connectors are added or removed.

## Context

Spec [[../2026-05-07-apps-docs-scaffold/spec]] (PR #19) shipped the Fumadocs scaffold with three throwaway placeholders (`index.mdx`, `hello.mdx`, `configuration.mdx`) and explicitly deferred all real content to a follow-up. Spec [[../2026-05-07-apps-docs-cf-deploy/spec]] (PR #26 + fixes) put the site on Cloudflare Workers at <https://docs.zeno-agent.dev>. The deploy is live, search works, the AI endpoints work, the layout matches the agreed nuqs.dev mirror, and the brand-gold tint has been removed from every UI surface — but the actual content is still placeholder. Outsiders landing on the docs see "under construction" with three dummy pages.

Meanwhile, several PRs since the scaffold landed have changed the operator surface in ways the docs must reflect:

- PR #21 (`fix(worker): boot without Slack channel`) — the worker now boots with a `NoopChannel` when Slack credentials are missing. Operators can install Slack via the dashboard *after* `zeno start`.
- PR #31 (`feat(dashboard): drop password gate, surface version, reorder first-run`) — no password gate on profile dashboards; first-run checklist is now Configure Claude → Connect Slack → Schedule cron.
- PR #32 (`feat(cli): interactive arrow-key picker on zeno upgrade`) — `zeno upgrade` with no flags drops into a TTY picker.
- spec [[../2026-05-07-multi-profile-cli/spec]] (status: draft, but the surface is already merged on `main` via PRs #18 + #22 + #24 + #32) — kills `config.yaml`, removes `zeno status / shell / build / update`, makes one container per profile, allocates ports `6101-6200` automatically, stores state in `~/.zeno/state.db`. The current `apps/cli/src/commands/*.ts` reflects this surface; the spec's draft status is bookkeeping, not a signal that the CLI surface is in flux.

The README ([commit 7b5d0fe](https://github.com/ribeirogab/zeno-agent/commit/7b5d0fe)) already points outsiders at `https://docs.zeno-agent.dev`; outsiders who follow that link land on the placeholders today, which is worse than no link.

## Problem Statement

`apps/docs` is structurally complete but functionally empty. Outsiders cannot:

- Understand what Zeno is and isn't from the docs surface alone.
- Install Zeno without bouncing back to the README.
- Discover that Slack onboarding moved into the dashboard post-boot.
- Know which connectors ship today (only four are in the README's "What works today" list; the catalogue actually carries seven: github-app, github, klaviyo, linear, swarmia, sentry, playwright).
- Find a CLI reference — the README's `zeno --help` table is the only public reference and it's truncated.

The docs site needs real content covering exactly the surface that ships today. Anything roadmapped (Codex backend, channel files, audio, multi-user, hosted instance, dashboard onboarding wizard, backup/restore tooling, doctor auto-fix) is explicitly out of scope.

## Non-Goals

This spec explicitly does **not** ship:

- **README rewrite or shrinking.** Once the docs site has real content, the README can shrink to "what is Zeno + 1-line install + link to docs". That is a follow-up spec.
- **Roadmap or aspirational coverage.** Anything in `ROADMAP.md` under `Now (in flight)` / `Next (committed)` / `Later (no commitment)` does not appear in the docs. `ROADMAP.md` is the place for that.
- **Architecture deep-dives** (constitution-grade content). The architecture overview lives in `vault/constitution.md` and stays there. The docs site says what the operator does, not how the worker is built.
- **API reference for `apps/api`.** The internal REST API serves the dashboard only. No public API surface to document.
- **Versioning / multi-version sidebar.** Skipped; revisit on first stable release.
- **i18n.** EN only.
- **Custom branding beyond what already shipped** — header crest, sidebar group, three-button page actions, etc. all stay as-is.
- **Per-PR preview deployments.** Already deferred in the cf-deploy spec.
- **Search analytics.** Pagefind/Orama default surface is enough.
- **Diagrams or screenshots.** Plain text + code blocks only. Adding screenshots adds an asset pipeline + alt-text discipline that is not justified for v1; revisit when content stabilizes.

## Constraints

- **Vault language is English-only.** Apps/docs content matches.
- **Sanitization rule** (`vault/rules/sanitization.md`): no real identifiers, no employer slugs, no real emails. Use the placeholders the rule lists. Slack workspace URLs / GitHub orgs in examples must be fictitious.
- **No mention of unshipped features.** A reader must finish the docs and only know what currently exists. If something is in `ROADMAP.md` under "Now / Next / Later" but not yet in `What works today` of the README and not yet listed in `agent/connectors-catalog.json`, it does not appear in the docs.
- **Build-step ordering is explicit.** Two generator scripts run **before** `fumadocs-mdx` so the generated MDX is visible when fumadocs-mdx walks the content tree. Single source of truth for the two scripts:

  | Script | Reads | Emits | Imported as |
  |---|---|---|---|
  | `apps/docs/scripts/generate-connector-catalogue.ts` | `agent/connectors-catalog.json` + icons under `agent/assets/connectors/` | `apps/docs/content/docs/connector-catalogue.mdx` (full page, with `title` + `description` frontmatter) and copies of icons under `apps/docs/public/connector-icons/` | rendered as a docs page (`/connector-catalogue`) |
  | `apps/docs/scripts/generate-cli-flag-tables.ts` | each `apps/cli/src/commands/<cmd>.ts` | `apps/docs/src/generated/cli-flags/<cmd>.mdx` (one per command) — **outside `content/docs/`** so Fumadocs does not pick them up as pages | imported into `cli.mdx` as `@/generated/cli-flags/<cmd>.mdx` |
  Wire-up:
  ```
  "scripts": {
    "predev":   "pnpm run docs:generate && fumadocs-mdx",
    "prebuild": "pnpm run docs:generate && fumadocs-mdx",
    "docs:generate": "tsx scripts/generate-connector-catalogue.ts && tsx scripts/generate-cli-flag-tables.ts"
  }
  ```
  The existing `cf:build` script chains `cf:build = "fumadocs-mdx && opennextjs-cloudflare build"` — the implementer prepends `pnpm run docs:generate &&` so the OpenNext build sees the generated artifacts. The `cf:build` change is part of this spec's diff.
- **Connector catalogue script** reads `agent/connectors-catalog.json` and copies each connector's icon from `agent/assets/connectors/` to `apps/docs/public/connector-icons/`. The emitted `connector-catalogue.mdx` carries frontmatter with both `title` and `description` fields populated (otherwise the page is silently dropped from `/llms.txt` per the scaffold spec's frontmatter contract).
- **CLI reference is hybrid:** each subcommand gets a hand-written paragraph (1–3 sentences) plus a fenced shell block showing one realistic invocation. The full flag list per subcommand is auto-generated from each `apps/cli/src/commands/<cmd>.ts` file's citty `args` schema and emitted as a markdown table at `apps/docs/src/generated/cli-flags/<cmd>.mdx`. The hand-written `cli.mdx` imports each table via Fumadocs's MDX import syntax (`import StartFlags from '@/generated/cli-flags/start.md'` then `<StartFlags />`). When a flag is added in code, the docs flag table updates on the next build.
- **Crons** — operators schedule them via the dashboard `/crons` route; CLI does not expose cron CRUD. The Concepts / Crons page makes that clear and links to the dashboard.
- **Quality gate** — `pnpm run quality-gate` must continue to pass after the rewrite. Lint covers all new MDX via `apps/docs/biome.json`-equivalent (currently inherited from root); typecheck covers any new TS scripts.
- **Deploy** — the existing `Deploy docs` workflow already covers `apps/docs/**` changes. No CI changes needed.
- **Page count** — exactly 11 MDX files under `apps/docs/content/docs/`, plus the `meta.json` separator config.
- **No new runtime dependencies on `apps/docs`.** Build-time scripts add **two explicit devDependencies**: `tsx` (for running TypeScript scripts directly without a separate compile step, matching the convention used elsewhere in the monorepo) and `gray-matter` (for emitting MDX frontmatter from the generator scripts). Both are added to `apps/docs/package.json` `devDependencies` rather than relying on transitive resolution; relying on a transitive dep can fail in strict linker setups or after a `fumadocs-mdx` minor bump that drops it. No runtime deps change.
- **Components** — Fumadocs UI's built-in `<Steps>`, `<Step>`, `<Callout>` cover the formatting needs. No custom components ship in this spec; if a need surfaces, the implementer captures it in a learning note and we revisit.

## User Stories / Scenarios

1. **Outsider lands on docs, decides whether to install.** They open <https://docs.zeno-agent.dev>, read "What is Zeno", understand the agent / connectors / channel / backend mental model, and either bounce or move to "Install".

2. **Operator runs the install.** They follow "Install" → "Create your profile" end to end and land on the dashboard with one connector installed and Slack producing a reply to `@zeno hello`. They do not need to consult the README during the flow.

3. **Operator looks up a CLI command they forgot.** They search for "upgrade" or land on Reference / CLI, find `zeno upgrade`, copy the example, run it.

4. **Outsider asks "what connectors does Zeno have today?".** They open Reference / Connector catalogue, see seven cards (github-app, github, klaviyo, linear, swarmia, sentry, playwright) each with a logo and one-line description.

5. **Operator wants to schedule recurring work.** They read Concepts / Crons, learn that crons are managed via the dashboard's `/crons` route, click through.

6. **AI agent ingests the docs.** External agent fetches `https://docs.zeno-agent.dev/llms-full.txt`. The corpus is now real content (~15 KB instead of placeholder boilerplate).

## Acceptance Criteria

Each item is a binary check verifiable in under a minute by someone other than the implementer.

- [ ] `apps/docs/content/docs/` contains exactly these MDX files: `index.mdx`, `install.mdx`, `profile.mdx`, `daily-ops.mdx`, `profiles.mdx`, `channels.mdx`, `connectors.mdx`, `skills.mdx`, `crons.mdx`, `cli.mdx`, `connector-catalogue.mdx`. The files `hello.mdx` and `configuration.mdx` no longer exist.
- [ ] **Per-page content scope.** Each Getting Started page covers exactly one slice of the install flow with no overlap:
  - `index.mdx` (What is Zeno) — the agent → connectors → channel → backend mental model in ~150 words. Does **not** include any commands.
  - `install.mdx` — the curl install line, prerequisites (git, docker, Node 24, pnpm 10), what the installer puts where (`~/.zeno/zeno-agent`, `~/.local/bin/zeno`). Does **not** include profile creation.
  - `profile.mdx` (Create your profile) — `zeno profile create` → edit `USER.md` → `zeno start` → Connect Claude in the dashboard → install one connector → mention `@zeno hello` in Slack and see a reply. End-to-end happy path. Does **not** include the full CLI flag table or the connector reference list.
  - `daily-ops.mdx` — covers the day-to-day commands `zeno start / stop / restart / logs / open / upgrade / doctor` and the dashboard URL pattern (`http://localhost:6101+`). Each command is a one-line description plus a single example invocation. Does **not** duplicate the full flag tables (those live in `cli.mdx`); does **not** cover profile create/delete (those live in `profile.mdx` and `cli.mdx`).
- [ ] `apps/docs/content/docs/meta.json` declares three groups via Fumadocs separator syntax (`"---Getting started---"`, `"---Concepts---"`, `"---Reference---"`) with the eleven pages slotted in the order specified above.
- [ ] Every MDX file has frontmatter with non-empty `title` and `description`.
- [ ] No MDX page mentions, by name or function, any of: Codex, Discord, Telegram, audio, voice, file upload, file download, multi-user, hosted, SaaS, signed tokens, 2FA, backup, restore, doctor auto-fix, dashboard onboarding wizard, Windows installer.
- [ ] **Build-time connector catalogue:** `apps/docs/scripts/generate-connector-catalogue.ts` reads `agent/connectors-catalog.json`, copies each connector's icon from `agent/assets/connectors/` to `apps/docs/public/connector-icons/`, and emits `apps/docs/content/docs/connector-catalogue.mdx` with a card per connector (logo `<img>` referencing the copied path, name, one-line description, link to upstream `docsUrl`). The script runs as a `prebuild` step in `apps/docs/package.json`.
- [ ] **Build-time CLI flag tables:** `apps/docs/scripts/generate-cli-flag-tables.ts` reads each `apps/cli/src/commands/<cmd>.ts` file, extracts the citty `args` schema, and emits a markdown table (flag, type, default, description) at `apps/docs/src/generated/cli-flags/<cmd>.mdx` per subcommand. The `cli.mdx` page imports each table via the `@/generated/cli-flags/<cmd>.mdx` alias and renders it inline. Hand-written prose stays in `cli.mdx`. Fragments live **outside** `content/docs/` so Fumadocs does not pick them up as navigable pages.
- [ ] **`cf:build` script ordering:** `apps/docs/package.json` `cf:build` begins with `pnpm run docs:generate &&` so the OpenNext build sees the generated MDX + fragments. Verifiable by `grep '"cf:build"' apps/docs/package.json`.
- [ ] **`docs:generate` script exists:** `apps/docs/package.json` declares `docs:generate` chaining the two generators (`tsx scripts/generate-connector-catalogue.ts && tsx scripts/generate-cli-flag-tables.ts`), and both `predev` + `prebuild` invoke it before `fumadocs-mdx`. Verifiable by `grep '"docs:generate"' apps/docs/package.json`.
- [ ] **`tsx` and `gray-matter` are explicit devDependencies** of `apps/docs/package.json` (not relied on transitively).
- [ ] Running `pnpm --filter @zeno/docs cf:build` from a clean workspace (`pnpm clean && pnpm install`) succeeds and produces `.open-next/worker.js`.
- [ ] `pnpm run quality-gate` exits zero across all 41+ tasks.
- [ ] After deploy, `curl -s https://docs.zeno-agent.dev/llms.txt` lists eleven entries (one per page) with title + URL + description.
- [ ] `curl -s https://docs.zeno-agent.dev/connector-catalogue` returns HTTP 200 and the rendered HTML contains the strings `github-app`, `github`, `klaviyo`, `linear`, `swarmia`, `sentry`, `playwright`.
- [ ] `curl -s 'https://docs.zeno-agent.dev/api/search?query=upgrade'` returns at least one hit pointing at `/cli` (the upgrade subcommand section).
- [ ] Each connector card on `/connector-catalogue` renders its logo (img tag with non-empty `src` resolving to `/connector-icons/<filename>`).
- [ ] Sidebar shows three group headers (`Getting started`, `Concepts`, `Reference`) with eleven items below them in the order locked in this spec.
- [ ] No real identifiers (per `vault/rules/sanitization.md`) appear in any MDX page or generated file.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Generated connector catalogue breaks when a new connector lands without an SVG/PNG icon. | The generator script iterates `agent/connectors-catalog.json` entries (never the asset directory) so stray icons under `agent/assets/connectors/` like `slack.svg` (no matching catalog entry today) do not produce phantom connector cards. The script fails the build with a clear error if `icon` is set in the JSON but the file is missing under `agent/assets/connectors/`. Optional: ship a fallback `default.svg` and warn instead of failing — decide during implementation. |
| Generated CLI flag tables go stale because citty schema parsing breaks on a future flag pattern. | The generator validates each command file produces *some* output; the build fails (not silently degrades) if a `commands/<cmd>.ts` file is encountered that the parser cannot read. The implementer captures any unsupported citty shapes as a learning note. |
| Eleven pages of real content blow `llms-full.txt` past a comfortable size. | Today's `llms-full.txt` is ~1 KB (placeholders). Eleven pages of real content lands somewhere between 15–30 KB — well within the LLM context budgets that the AI-friendly endpoints target. Re-evaluate at >100 KB. |
| Connector catalogue duplicates information that already lives in the dashboard. | Acceptable — the dashboard is per-profile (`http://localhost:6101+/connectors`); the docs catalogue is the public reference outsiders evaluating Zeno see *before* they install. Different audience. |
| The CLI reference page becomes the de-facto man page and drifts from `zeno --help`. | The flag tables are auto-generated, so they cannot drift. The hand-written prose for each subcommand is short on purpose (1–3 sentences); when behavior changes, the prose is part of the same PR that changes the command. Quality-gate-time the implementer skims `apps/docs/content/docs/cli.mdx` for any references to flags that no longer exist. |
| Slack-only Channels page reads thin. | Acceptable — the abstraction is real (`vault/learnings/channel-vs-connector.md`). The page documents Slack today + a one-paragraph "future channels" note linking to `ROADMAP.md` for items #9/#10/#11/#12 (channel files, audio). The reader leaves understanding the abstraction even though only Slack ships. |
| Removing `hello.mdx` and `configuration.mdx` breaks the spec/scaffold AC about Pagefind search hitting the SUPERCALIFRAGILISTIC token. | The scaffold spec is shipped; that AC was met when it shipped and does not need to be re-met every release. Delete both files in this spec's PR. The new search test (in this spec's AC) targets a real term ("upgrade"). |

## Open Questions

None at spec time. Q1 (3 groups vs flat) — locked at 3 groups. Q2 (CLI reference style) — locked at hybrid (auto-generated flag tables + hand-written prose). Q3 (Channels page) — locked at dedicated page. Q4 (Connector catalogue) — locked at build-time generated with logos. Crons promoted to a Concepts page. Versioning + cross-link pagination — Fumadocs defaults stand.
