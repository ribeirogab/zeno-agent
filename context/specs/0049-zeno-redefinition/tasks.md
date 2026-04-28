---
feature: zeno-redefinition
plan: "[[plan]]"
spec: "[[spec]]"
created: 2026-04-27
---
# Zeno Redefinition — Tasks

**For this plan:** `[[plan]]`

## Phase 1: Constitution targeted edits

### Task 1.1: Rewrite "Why Zeno exists" section

- [ ] Step 1: Open `context/constitution.md`. Locate the section starting at `## Why Zeno exists` (currently lines 11-21).
- [ ] Step 2: Rewrite the section so the central thesis is "**Zeno is a personal agent that operates across the apps you use, by composing the connectors you install. The channel (Slack today; others later) is the I/O boundary; everything else flows through connectors.**" The section must list the 5 layers in order (connectors > channel > backend > core > skills future) with a one-sentence description per layer. The "Skills (future)" line states they are deferred from the runtime and may return possibly bundled with connectors.
- [ ] Step 3: Verify the rewritten section does not mention "intelligence lives in skills", "skills are the product", "skill layer wins", or "agentskills.io as the standard skills follow" (the latter is recontextualized in Task 1.2 as inspiration).
- [ ] Step 4: Verify the rewritten section keeps the cross-link to `[[../profiles/USER.md|USER.md]]` for who the user is, and the cross-link to `[[learnings/channel-vs-connector]]` if it survived.

### Task 1.2: Rewrite "Architecture principles" first paragraph

- [ ] Step 1: Locate the "Architecture principles" section. The first paragraph currently describes "Ports & adapters. Three pluggable abstractions: `Channel`, `AgentBackend`, and `Connector`..." (line 32).
- [ ] Step 2: Rewrite to lead with the 5-layer hierarchy (connectors > channel > backend > core > skills future) and reframe the "ports & adapters" framing around connectors as the primary capability surface. Keep the existing wording about Channel ≠ Connector being a distinct concept (input/output adapter vs tool callable by the agent), and the reference to `[[learnings/channel-vs-connector]]`.
- [ ] Step 3: Recontextualize the `agentskills.io` mention (if present in this section): keep it as a reference to the open-standard composable-units philosophy that inspired the connector model. Skills (deferred) may return possibly bundled with connectors — this is a future direction, not a current commitment.

### Task 1.3: Drop "Zero custom tools by default" bullet

- [ ] Step 1: Locate the bullet `- **Zero custom tools by default.** Capabilities come from Claude Code's built-in toolset (\`Bash\`, \`Read\`, \`Write\`, \`Edit\`, \`Grep\`, \`Glob\`). Custom tools require justification in a learning or spec — the bias is to teach the agent through the system prompt and let it use the shell.` (currently line 33 of constitution.md).
- [ ] Step 2: Replace with: `- **Capabilities come from connectors.** External capabilities are surfaced exclusively as MCP tools exposed by connectors the operator installs via the dashboard. The agent does not have direct shell, filesystem, or web-fetch access at runtime; if a capability is missing, the answer is to install or build a connector for it, not to script around it.`

### Task 1.4: Reconcile "Knowledge layering" runtime-tools mention

- [ ] Step 1: Locate the line `Runtime context the agent actually needs is narrow: who the user is (`USER.md`, mounted), the system prompt (built at boot), and the tools available in the container.` (currently line 76 of constitution.md, in the "Knowledge layering" section).
- [ ] Step 2: Replace `the tools available in the container` with `the MCP tools exposed by connectors the operator has enabled via the dashboard`.

### Task 1.5: Verify thesis-agnostic sections are preserved

- [ ] Step 1: Read the constitution end-to-end. Confirm the following sections are byte-identical to before this phase: "Scope guardrails", "Tooling and workflow principles", "Spec-Driven workflow", "Knowledge layering" (apart from Task 1.4's targeted change), "What this constitution is not".
- [ ] Step 2: Confirm `[[wikilinks]]` to `learnings/`, `_index/`, `conventions/`, etc. are intact.
- [ ] Step 3: Commit with message `docs(constitution): pivot to connectors-only thesis (spec 0049)`.

## Phase 2: SOUL.md full rewrite

### Task 2.1: Replace agent/SOUL.md

- [ ] Step 1: Open `agent/SOUL.md`. Discard the existing 57 lines.
- [ ] Step 2: Write a fresh SOUL.md that:
  - Identifies Zeno as a personal agent that operates across the user's apps via the connectors installed in the dashboard
  - Names the channel (Slack today, others future) as the I/O boundary
  - States explicitly that capabilities come from connectors (`mcp__<server>__<tool>` tools); the agent does not have shell or filesystem or web-fetch primitives
  - States that skills as a runtime concept are deferred; they may return later possibly bundled with connectors. The agent today should not attempt to "match request to skill" — it composes connector tools directly.
  - Preserves the "final-message-is-the-reply" mechanic (still operationally true regardless of skills): the agent's last text becomes the channel reply; never `chat.postMessage` manually
  - Preserves the language and tone guidance (respond in user's language, USER.md preferences override, direct/practical, light humor, Slack mrkdwn)
  - Preserves the inviolable safety rules — but **adapt to connectors-only:**
    - "Never echo TOKEN/KEY/SECRET env var values" — keeps (general security)
    - "Never send file contents from host to external URLs" — restate as "never exfiltrate operator data via connector tools"
    - "Never `rm -rf` outside workspace volumes" — drop (no shell access)
    - "Never take actions touching shared external resources without asking the user first" — keep (still relevant for prod-side connector tools like merge_pr, deploy, send_email)
    - Add a new rule: "Refuse if asked to claim a capability you don't have via the connectors currently installed; honesty over plausibility"
- [ ] Step 3: Verify length is reasonable (~50-90 lines — similar order of magnitude to before).
- [ ] Step 4: Commit with message `docs(soul): rewrite agent identity around connectors-only (spec 0049)`.

## Phase 3: README rewrite

### Task 3.1: Rewrite README intro (everything before `## Project structure`)

- [ ] Step 1: Open `README.md`. The current intro (lines 1-10) starts with `# Zeno` then `> **A personal agent whose intelligence lives in the skills you author.**` then 3 paragraphs.
- [ ] Step 2: Replace the intro entirely. New shape:
  - `# Zeno` heading
  - Tagline: `> **Personal agent that operates across the apps you use, by composing connectors you install. Self-hosted.**`
  - 2-3 paragraphs describing: what Zeno does (operates across apps — open PRs, analyze Sentry errors, ship code via connectors), how it does it (the 5-layer hierarchy: connectors > channel > backend > core > skills future), the product positioning ("Adding a capability means installing or building a new connector. Zeno grows sideways, through the library of connectors you install via the dashboard.")
  - One sentence: skills are deferred and may return possibly bundled with connectors
- [ ] Step 3: Preserve heading anchors of the rest of README (`## Project structure`, `## Prerequisites`, `## Setup`, `## Usage`, `## Docker scripts`, `## Running multiple profiles`, `## Performance`, `## Troubleshooting`, `## Architecture`, `## Development`, `## Smoke test`).

### Task 3.2: Targeted edits to "Project structure" section

- [ ] Step 1: The current section shows `agent/skills/` and `profiles/default/skills/` as part of the layout.
- [ ] Step 2: Drop those rows. Replace the supporting prose (`agent/ is committed — it *is* Zeno. ...`) so it no longer treats skills as a layout component, but mentions config + entrypoint files.
- [ ] Step 3: Update the prose under the layout block to reflect connectors-via-dashboard model (already partially correct: `MCP servers (connectors) are configured entirely through the dashboard at /connectors and stored in the SQLite DB.`).

### Task 3.3: Targeted edits to "Architecture" section

- [ ] Step 1: Current Architecture section lists Channels / Agent Core / Agent Backends / Agent / Profile (lines 134-139).
- [ ] Step 2: Update so the bullets reflect the new 5-layer model. Add a "Connectors" bullet describing them as MCP tool surfaces the agent calls (DB-managed via dashboard). Reword "Agent" bullet to drop `skills/`. Reword "Profile" bullet to drop `mcp.json` + `skills/`.

### Task 3.4: Drop "Running multiple profiles" skill mentions

- [ ] Step 1: Locate the line `Each profile runs as an isolated container with its own Slack app, credentials, skills, and workspace` (line 98).
- [ ] Step 2: Replace `credentials, skills, and workspace` with `credentials, and workspace`.
- [ ] Step 3: Locate the `mkdir -p profiles/work/skills` instruction (line 110).
- [ ] Step 4: Replace with `mkdir -p profiles/work` (without skills subdir).
- [ ] Step 5: Locate `the work container cannot see personal skills/credentials` (line 117). Replace `personal skills/credentials` with `personal credentials`.

### Task 3.5: Targeted edits to other sections

- [ ] Step 1: Setup section step 1 — drop reference to skills if present.
- [ ] Step 2: Troubleshooting table — review and update any skill-related entry.
- [ ] Step 3: Smoke test — review.

### Task 3.6: Commit Phase 3

- [ ] Step 1: Verify `git diff` on README.md shows only the intended changes.
- [ ] Step 2: Commit with message `docs(readme): pivot to connectors-only positioning (spec 0049)`.

## Phase 4: CLAUDE.md + AGENTS.md targeted edits

### Task 4.1: Update CLAUDE.md workspace layout

- [ ] Step 1: Open `CLAUDE.md`. Locate the workspace layout block (line 42-52).
- [ ] Step 2: Drop the line `agent/               SOUL.md, mcp.json, skills/ (Zeno's identity — shared across profiles)` and replace with `agent/               SOUL.md, mcp.json, connectors-catalog.json (Zeno's identity — shared across profiles)`.
- [ ] Step 3: Drop the line `profiles/default/    .env, USER.md, config.yaml, mcp.json, skills/ (user config per profile)` and replace with `profiles/default/    .env, USER.md, config.yaml (user config per profile)`.

### Task 4.2: Update AGENTS.md workspace layout

- [ ] Step 1: Open `AGENTS.md`. Make the same two replacements as Task 4.1.

### Task 4.3: Commit Phase 4

- [ ] Step 1: Commit with message `docs(claude+agents): drop skills/ from workspace layout (spec 0049)`.

## Phase 5: Learnings supersede pass

### Task 5.1: Produce per-file decision table

- [x] Step 1: List every `.md` file in `context/learnings/`. For each file, read its frontmatter + first 2 paragraphs. — 17 files mention "skill"; predicate applied to each.
- [x] Step 2: Apply the predicate: "If a future contributor reads this file as canonical, would they reintroduce skills as Zeno's primary capability surface?"
- [x] Step 3: Decision table:

  | File | Decision | Rationale |
  |---|---|---|
  | `agent-skills-open-standard.md` | **superseded** | Prescribes adopting agentskills.io as Zeno's standard for "skills"; future reader treats it as the path forward. |
  | `closed-learning-loop-self-improving-skills.md` | **superseded** | Title literally promotes "self-improving skills" as a Zeno bet; reader would design Zeno around it. |
  | `lessons-for-zeno-from-openclaw-hermes.md` | **superseded** | Recommends `SKILL.md + MCP servers` as Zeno's future capability surface — directly the old thesis. |
  | `skill-scoped-credentials-pattern.md` | **superseded** | Prescribes per-skill credential pattern as canonical for Zeno. |
  | `workspace-markdown-files-pattern.md` | **superseded** | Lists `SKILL.md` as expected workspace file in Zeno's shape; skills not a runtime concept now. |
  | `claude-code-cli-headless.md` | preserved | Third-party Claude Code CLI flag reference; mentions skill only describing `--bare`. |
  | `claude-sdk-settings-sources-skills.md` | preserved | Third-party SDK gotcha (settingSources required); useful if skills come back. Not a thesis prescription. |
  | `claudeclaw-claude-code-plugin-pattern.md` | preserved | Reference about claudeclaw plugin pattern (third-party tool); plugin layout includes `/skills`, but the lesson is about the plugin pattern itself. |
  | `docker-multi-profile-via-compose.md` | preserved | Lesson about Docker Compose multi-profile isolation; mentions "skills" as one example of what shouldn't cross-contaminate. The infra lesson is durable. |
  | `git-credential-helper-for-token-rotation.md` | preserved | Lesson about git credential helpers (avoid embedding tokens in clone URLs). Mentions `dev-workflow` skill as the use case but the principle is generic. |
  | `hermes-architecture.md` | preserved | Reference about Hermes agent (third-party). Comparing other agents. |
  | `hermes-prompt-caching-invariants.md` | preserved | Lesson about prompt-cache invariants. Skill-loading is one example; the general principle (don't break cache mid-conversation) is durable and applies to any per-turn dynamic loading (system prompt, USER.md, etc.). |
  | `multi-agent-routing-channels-to-agents.md` | preserved | Lesson about routing channels to agents. Mentions skills as a per-agent property, but the routing pattern is the thing. |
  | `openclaw-architecture.md` | preserved | Reference about OpenClaw (third-party). |
  | `profile-isolation-via-env-var.md` | preserved | Lesson about Hermes' `HERMES_HOME` env-var trick. Mentions skills as one of the per-profile state paths — the lesson (one env var resolves all) generalizes to any per-profile state. |
  | `slack-mrkdwn-vs-markdown.md` | preserved | Lesson about Slack mrkdwn conversion at the channel adapter layer. Mentions skill in passing as an example consumer. |
  | `spec-review-loop-catches-real-bugs.md` | preserved | Lesson about using `spec-document-reviewer`. Mentions Claude Code's `brainstorming` skill (a Claude Code skill, not a Zeno runtime skill). |

  **Total:** 5 superseded, 12 preserved.

- [x] Step 4: For each file marked superseded, added `status: superseded` and `superseded_by: 0049` to the existing frontmatter (preserved all other fields), plus a one-paragraph banner under frontmatter explaining the supersession with cross-links.
- [x] Step 5: Verify body content unchanged below the banner — confirmed via `git diff` showing only frontmatter + banner additions.

### Task 5.2: Update learnings index

- [ ] Step 1: Open `context/_index/learnings.md`. Verify the index does not need a "superseded" section. If the project's index pattern is to flag superseded entries inline, add the flags.
- [ ] Step 2: If no flagging convention exists, leave the index alone (the frontmatter on each file is already the source of truth).

### Task 5.3: Commit Phase 5

- [ ] Step 1: Commit with message `docs(learnings): mark superseded learnings (spec 0049)`.

## Phase 6: New learnings

### Task 6.1: Create `connectors-only-pivot.md`

- [ ] Step 1: Create `context/learnings/connectors-only-pivot.md`. Use the project's learning template (`context/templates/learning.md`) for frontmatter shape.
- [ ] Step 2: Write 1-2 pages capturing:
  - The pivot context (skills-as-product was the original thesis; concrete operational problems surfaced; user decided to switch)
  - The new thesis: connectors-only access; Slack/channel as I/O boundary; skills deferred
  - The 5-layer hierarchy (connectors > channel > backend > core > skills future)
  - What stays / what goes (high level)
  - Pointer forward: spec 0050 (skills + classifier removal) and spec 0051 (connector ergonomics) are the cleanup arc
  - Why this is durable: the "agents act across apps" mission is more enduring than any specific implementation
- [ ] Step 3: Cross-link with `[[../specs/0049-zeno-redefinition/spec|0049]]` and the future specs (use placeholder wikilinks that will resolve once 0050/0051 land).

### Task 6.2: Create `how-to-read-pre-cleanup-specs.md`

- [ ] Step 1: Create `context/learnings/how-to-read-pre-cleanup-specs.md`. Use the project's learning template.
- [ ] Step 2: Short content (~half a page):
  - Specs and learnings dated before this batch with `status: superseded` reflect the old "skills as the product" thesis.
  - When reading them, treat their prescriptions as historical context, not current architecture.
  - Map old vocabulary to new: "skill" → "domain knowledge that may return possibly bundled with connectors"; "shell tool / Bash / built-in toolset" → "connector MCP tools".
  - Cross-link with `[[connectors-only-pivot]]` for the durable lesson.

### Task 6.3: Commit Phase 6

- [ ] Step 1: Commit with message `docs(learnings): add connectors-only-pivot + reading guide (spec 0049)`.

## Phase 7: Three-round review on the full doc set

### Task 7.1: Round 1

- [ ] Step 1: Read sequentially in the order written: constitution → SOUL → README → CLAUDE → AGENTS.
- [ ] Step 2: Read both new learnings: connectors-only-pivot, how-to-read-pre-cleanup-specs.
- [ ] Step 3: For each file, scan for: (a) leftover skill-as-runtime mentions, (b) tone inconsistency vs. other docs, (c) broken wikilinks, (d) factual contradictions with the new thesis or among each other.
- [ ] Step 4: If any finding → fix → reset counter to round 1.

### Task 7.2: Round 2

- [ ] Step 1: Same as Round 1, full sequential read. Pretend round 1 never happened (fresh eyes).
- [ ] Step 2: Any finding → fix → reset.

### Task 7.3: Round 3 (independent perspective)

- [ ] Step 1: Dispatch a fresh agent (Explore subagent type) with the prompt: "Read all of `agent/SOUL.md`, `context/constitution.md`, `README.md`, `CLAUDE.md`, `AGENTS.md`, and the two new learnings (`connectors-only-pivot.md`, `how-to-read-pre-cleanup-specs.md`). Look for: (a) any place still treating skills as a current runtime concept, (b) tone inconsistencies, (c) broken links, (d) factual contradictions. Report findings or `CLEAN`."
- [ ] Step 2: Any finding → fix → restart at Round 1.
- [ ] Step 3: When all three rounds are CLEAN consecutively, commit any final fix-up with message `docs: 3-round review fixes (spec 0049)` if needed.

## Phase 8: GitHub repo "About" tagline

### Task 8.1: Update via gh

- [ ] Step 1: Run `gh repo edit octocat/zeno-agent --description "Personal agent that operates across the apps you use, by composing connectors you install. Self-hosted."`.
- [ ] Step 2: Verify with `gh repo view octocat/zeno-agent --json description -q .description`.

## Phase 9: Push + open PR

### Task 9.1: Final pre-flight

- [ ] Step 1: Run `git status` — working tree clean.
- [ ] Step 2: Run `git log --oneline main..HEAD` — confirm all expected commits are present and well-named.
- [ ] Step 3: Run `git diff main -- apps/ packages/ infra/ '*.yaml' '*.env'` — output must be empty (no code/config changes).

### Task 9.2: Push + open PR

- [ ] Step 1: `git push -u origin docs/zeno-redefinition`.
- [ ] Step 2: `gh pr create --base main --head docs/zeno-redefinition --title "docs: Zeno redefinition — connectors-only positioning (spec 0049)" --body <body>` where body summarizes: what changed (5 anchor docs + 2 new learnings + N learnings marked superseded + GitHub About), what's preserved (specs 0023/0028/0047 remain canonical until 0050; thesis-agnostic constitution sections untouched), test plan (3-round review passed; manual verification of GitHub About).
- [ ] Step 3: Output PR URL.

## Phase 10: Final 3-round review on the entire batch (after PRs 0050+0051 also land)

This phase is documented here for the contract record but **executes after spec 0051's PR merges**. It applies Rule 2's "vale por etapa E pelo trabalho inteiro" — three consecutive clean reviews on the full cleanup arc before the work is declared done.

(Out of scope for this PR; documented as forward record.)
