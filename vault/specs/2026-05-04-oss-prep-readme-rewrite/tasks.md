---
feature: oss-prep-readme-rewrite
plan: "[[plan]]"
spec: "[[spec]]"
created: 2026-05-04
---
# OSS-Prep — README Rewrite — Tasks

**For this plan:** `[[plan]]`

> **Execution model:** inline. Branch `chore/oss-prep-readme` is already created.

---

## Phase 1: Rewrite

### Task 1.1: Overwrite `README.md`

**Files:**
- Modify (overwrite): `README.md`

- [ ] Step 1: Replace the entire contents of `/Users/gabriel/www/ribeirogab/zeno-agent/README.md` with the following:

````markdown
# zeno-agent

> Personal agent that operates across the apps you use, by composing the connectors you install. Self-hosted. Single-user.

**Status:** early / experimental — personal project, single-user, no SLA, no support guarantees, breaking changes expected. Use at your own risk.

## What it does

Zeno acts on your behalf inside the apps you already work in. Open a pull request after fixing a Sentry error. Triage your inbox. List the issues blocking the current sprint. Comment on a PR with the output of a code review. Anything that involves *acting* in an external app, Zeno can do — provided you have installed a connector for that app. Connectors are the heart of the product: each one is a small MCP server you install through the dashboard at `http://localhost:3000/connectors`. Without connectors, Zeno is a talking statue.

## Quickstart

Prerequisites:

- Docker and Docker Compose
- A Slack workspace where you can install a custom app (manifest: `infra/slack-app-manifest.json`)
- A Claude account on a Pro or Max plan

```bash
git clone https://github.com/ribeirogab/zeno-agent.git
cd zeno-agent
cp profiles/default/.env.example profiles/default/.env
cp profiles/default/USER.example.md profiles/default/USER.md
cp profiles/default/config.example.yaml profiles/default/config.yaml
echo "ZENO_MASTER_KEY=$(openssl rand -hex 32)" >> profiles/default/.env
pnpm run docker:build
pnpm run docker:up
```

Open `http://localhost:3000`, sign in with the `DASHBOARD_PASSWORD` you set in `.env`, click **Connect Claude** to complete the OAuth flow, install at least one connector from the catalogue, then mention the bot in any Slack channel where it is invited.

## What works today

- Slack channel adapter (Socket Mode; mention the bot or DM it)
- GitHub connector (issues, pull requests, code search)
- Linear connector (issues, projects, cycles)
- Klaviyo connector (campaigns, profiles)
- Skill playbooks (markdown files installed via dashboard upload, auto-discovered by the agent)
- Multi-profile isolation (run a separate container per workspace, each with its own credentials)
- Per-tool capability gating (toggle individual connector tools on or off from the dashboard)

What is **not** here yet: no multi-user support (single operator only), no production-deployment recipe, no hosted instance.

## Setup notes

- Profile examples live at `profiles/default/.env.example`, `profiles/default/USER.example.md`, and `profiles/default/config.example.yaml`. The non-`.example` copies are gitignored.
- The Slack app manifest is at `infra/slack-app-manifest.json`.
- Detailed reading: `CLAUDE.md` for the agent's working contract, `vault/_index/home.md` for the project's knowledge map, and `vault/constitution.md` for the non-negotiable design principles. A full documentation site (`apps/docs`) is on the roadmap.

## Project layout

```
apps/        worker (agent runtime), api (REST), dashboard (Vite + React)
packages/    @zeno/storage, @zeno/logger, @zeno/ui, @zeno/github-app, @zeno/mcp-discover
agent/       SOUL.md, mcp.json, connectors-catalog.json (committed identity)
infra/       Dockerfile, docker-compose, entrypoint, slack-app-manifest.json
profiles/    per-context isolation (default committed as examples; rest gitignored)
vault/       constitution + specs + learnings + conventions + rules
```

Architecture detail lives in `vault/constitution.md` until the documentation site ships.

## Contributing, security, license

- Issues and pull requests: see [CONTRIBUTING.md](./CONTRIBUTING.md).
- Vulnerability reports: see [SECURITY.md](./SECURITY.md).
- Code of conduct: [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
- License: [MIT](./LICENSE).
````

- [ ] Step 2: Verify the file has the eight required top-level sections in order. Run:

```bash
grep -nE '^(# zeno-agent|\*\*Status:|## What it does|## Quickstart|## What works today|## Setup notes|## Project layout|## Contributing, security, license)' README.md
```

Expected: eight matches in this exact order.

- [ ] Step 3: No commit yet — verification phase runs first.

---

## Phase 2: Verification

### Task 2.1: Sanitization and language guards

- [ ] Step 1: EN guard — run:

```bash
grep -nE '\b(você|porquê|nessa|também|então|usuário|configura)\b' README.md
```

Expected: zero matches.

- [ ] Step 2: Personal-identifier guard — run:

```bash
grep -nE 'Gabriel|gblosr|ribeirogab' README.md
```

Expected: only the canonical clone URL `https://github.com/ribeirogab/zeno-agent.git` should match. No occurrence of the maintainer's first name in prose. No occurrence of the personal email. No `ribeirogab/...` reference other than the clone URL.

- [ ] Step 3: Third-party-identifier guard — run:

```bash
grep -nE '\b(Flávia|FlaviaNasser|fn-)\b' README.md
```

Expected: zero matches.

### Task 2.2: Link resolution

- [ ] Step 1: Confirm every relative link in the README resolves. Run:

```bash
for path in CONTRIBUTING.md SECURITY.md CODE_OF_CONDUCT.md LICENSE \
            CLAUDE.md vault/_index/home.md vault/constitution.md \
            infra/slack-app-manifest.json \
            profiles/default/.env.example \
            profiles/default/USER.example.md \
            profiles/default/config.example.yaml; do
  test -e "$path" && echo "OK: $path" || echo "MISSING: $path"
done
```

Expected: every line is `OK`.

### Task 2.3: Line count check

- [ ] Step 1: Confirm the README sits in the soft 50–100 line range. Run:

```bash
wc -l README.md
```

Expected: a count between 50 and 100. If outside, do not pad or trim — verify the content first; the spec accepts a small overshoot for genuine content.

---

## Phase 3: Quality gate

### Task 3.1: Run quality-gate

- [ ] Step 1: Run:

```bash
pnpm run quality-gate
```

Expected: `Tasks: 28 successful, 28 total` (or `28 cached, 28 total` if Turbo's cache is warm). The README change touches no code; this is a smoke test confirming the workspace still lints, typechecks, and tests cleanly.

### Task 3.2: Commit the rewrite

- [ ] Step 1: Stage and commit:

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs: rewrite README for outsider audience (track D)

Replaces the maintainer-self README (~170 lines: pre-0071 migration block,
multi-profile section, performance budget, troubleshooting table, smoke
test) with a minimal outsider-facing README (~60-80 lines: pitch, status,
quickstart, what works today, setup notes, layout, license/contributing
footer). Architecture detail and detailed concept docs are deferred to
the future apps/docs workspace; this README is a placeholder until that
ships.
EOF
)"
```

---

## Phase 4: Pull request

### Task 4.1: Push branch and open the PR

- [ ] Step 1: Confirm branch state:

```bash
git status
git log --oneline main..HEAD
```

Expected: branch `chore/oss-prep-readme`, two commits (the spec/plan/tasks commit plus the README rewrite commit).

- [ ] Step 2: Push:

```bash
git push -u origin chore/oss-prep-readme
```

- [ ] Step 3: Open the PR:

```bash
gh pr create --title "chore(oss-prep): rewrite README for outsider audience" --body "$(cat <<'EOF'
## Summary

Track D of the OSS-prep pipeline (`tmp/oss-prep-pipeline.txt`). Replaces the maintainer-self README with a minimal outsider-facing README so stargazers and hobbyist self-hosters get a clean pitch + quickstart instead of a 170-line maintainer notebook.

Spec: [`vault/specs/2026-05-04-oss-prep-readme-rewrite/spec.md`](https://github.com/ribeirogab/zeno-agent/blob/chore/oss-prep-readme/vault/specs/2026-05-04-oss-prep-readme-rewrite/spec.md)

## What changed

- `README.md` — rewritten end-to-end. Eight sections: title + tagline, status, what it does, quickstart, what works today, setup notes, project layout, contributing/security/license footer. Roughly 60–80 lines. No migration notes, no troubleshooting table, no architecture write-up — those defer to the future `apps/docs` workspace.

## What did NOT change

- No code touched. No vault content touched (other than the spec/plan/tasks committed alongside).
- No community files modified (`CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `LICENSE` all from PR #2 stand).

## Test plan

- [x] `pnpm run quality-gate` is green (28/28 tasks).
- [x] EN guard clean: `grep -nE '\b(você|porquê|nessa|também|então|usuário|configura)\b' README.md` returns zero matches.
- [x] Sanitization guard clean: only the canonical clone URL matches `ribeirogab`; no maintainer first name, no personal email, no third-party first names.
- [x] Every relative link in the README resolves.
- [x] Line count is within the 50–100 soft range.
EOF
)"
```

- [ ] Step 4: Wait for operator approval before merge.
