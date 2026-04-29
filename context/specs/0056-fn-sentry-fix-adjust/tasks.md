---
feature: fn-sentry-fix-adjust
plan: "[[plan]]"
spec: "[[spec]]"
created: 2026-04-29
---
# fn-sentry-fix v2 Adjustments — Tasks

**For this plan:** `[[plan]]`

> **For agentic workers:** REQUIRED SUB-SKILL — Use the existing 3-round review pattern from the cleanup contract (`tmp/zeno-cleanup-contract.md` Rule 2): after each phase ends with a commit, run R1/R2/R3 reviews; reset counter on any blocking finding. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Each phase ends with a commit (except phase D — E2E results go under `tmp/` and are NOT committed). Quality gate is irrelevant — this spec touches only `profiles/fn/skills/fn-sentry-fix/SKILL.md` (markdown body, no code).
>
> Per Rule 4 of the contract: implement without asking permission for trivia; only stop for `git push` / `gh pr create` / `gh pr merge` (already pre-authorized for this branch).

---

## Phase A — Baseline + trim plan

**Goal:** Read current SKILL.md state, count lines, identify trim candidates, produce a numerical budget that fits ≤480 lines.

### Task A.1 — Capture baseline

- [ ] **A.1.1** Count current SKILL.md line count:
  ```bash
  wc -l profiles/fn/skills/fn-sentry-fix/SKILL.md
  ```
  Expected: 493 (or 491 if the uncommitted "NO progress/status messages" paragraph in working tree is reverted; the v2 work absorbs it either way — final state is what matters).

- [ ] **A.1.2** Verify the "NO progress/status messages" paragraph is at lines 16-18 (or in working tree if uncommitted):
  ```bash
  sed -n '16,18p' profiles/fn/skills/fn-sentry-fix/SKILL.md
  ```
  Expected: starts with `**NO progress/status messages.**` — this paragraph gets REPLACED in Task B.1.

- [ ] **A.1.3** Identify Phase boundaries for the +5 line additions:
  ```bash
  grep -n '^## Phase ' profiles/fn/skills/fn-sentry-fix/SKILL.md
  ```
  Note the line numbers of `## Phase 1`, `## Phase 2`, `## Phase 4`, `## Phase 5` — the progress msgs go at the END of Phase 1 (just before `## Phase 2`) and END of Phase 4 (just before `## Phase 5`).

- [ ] **A.1.4** Identify trim candidates:
  ```bash
  grep -n 'docker_or_inside_container\|git log -S' profiles/fn/skills/fn-sentry-fix/SKILL.md
  ```
  Note the line ranges. The `docker_or_inside_container` block (Phase 7 dead-code per spec 0055 iteration) is the largest single cut. The `git log -S` false-positive guard can be compressed.

### Task A.2 — Trim budget math

- [ ] **A.2.1** Compute target delta:
  - Baseline: 493 lines
  - v2 additions: ~25 lines (Turn output contract section) + 5 (progress msg #1) + 5 (progress msg #2) = ~35 lines
  - After additions (no trims): ~528 lines
  - Target: ≤480 lines
  - Net trim required: ≥48 lines

- [ ] **A.2.2** Validate trim plan covers the budget:
  - `docker_or_inside_container` dead-code: ~15 lines
  - `git log -S` false-positive guard compression: ~5 lines
  - Phase 5/6 stuck template duplication condense: ~10 lines
  - Sentry MCP tool table compression: ~10 lines
  - `gh pr create` block condense: ~8 lines
  - Total: ~48 lines — meets budget.

  If the implementer hits 480 with margin (e.g., 475), STOP trimming — don't over-cut signal.

---

## Phase B — Edit SKILL.md (single commit)

**Goal:** Replace the "NO progress/status messages" paragraph with the new "Turn output contract" section, add the 2 progress message templates inline at end of Phase 1 and Phase 4, trim verbose sections to land at ≤480 lines.

### Task B.1 — Replace "NO progress/status messages" with "Turn output contract"

- [ ] **B.1.1** Replace lines 16-18 (the existing `**NO progress/status messages.**` paragraph) with the new Turn output contract section. Use the Edit tool with `old_string` matching the current paragraph and `new_string` containing:

  ```markdown
  ## Turn output contract

  The runtime auto-posts each assistant turn-text emission to Slack as a separate message. So every text emission in this skill MUST be one of these 6 allowed shapes:

  **Final messages (4 — exactly ONE per invocation, last text emission, with `<@${user_id}>` mention):**
  1. Success — Phase 7 template (sentry fix shipped + PR URL + 3 bullets)
  2. Stuck — Phase 4/5/6 templates (sentry fix stuck + ⚠️ header + structured fields)
  3. Auto-resolve — Phase 3 template (already-resolved upstream)
  4. Clarification — multi-issue / zero-issue from Phase 1

  **Progress messages (2 — short, no `<@user_id>` mention, each fires AT MOST ONCE per invocation):**
  5. After Phase 1 fetch SUCCESS: `🔍 investigando *<SENTRY-ID>*...`
  6. After Phase 4 gate PASS: `✅ gate passou — partindo pro fix em \`<owner>/<repo>\``

  **DON'T emit any other turn-text.** Examples that are FORBIDDEN as standalone text emissions:
  - Filler like "Aguardando o `zeno-development`...", "Investigando agora...", "Vou começar a verificação..."
  - Status updates like "Cloning repo...", "Found 3 candidates...", "Running tests..."
  - Any code block / diff / formatted data block emitted before the final structured message (e.g. ```bash blocks, JSON dumps, stack trace previews — these are only valid INSIDE the stuck templates' `diff` field, not as standalone interim output)
  - Acknowledgements like "OK", "Got it", "On it"

  **Tool calls don't count as turn-text.** `Skill(zeno-development, ...)`, `Bash(...)`, `Read(...)`, `Edit(...)` — none of these emit Slack messages. Only your assistant text does.

  **Skill is synchronous.** When you call `Skill(zeno-development, ...)`, it returns the result inline — there is no sub-process to "wait for", so never emit "Aguardando..." text. After the Skill call returns, continue directly to Phase 5/6/7 work.
  ```

- [ ] **B.1.2** Verify the replacement landed:
  ```bash
  grep -n '## Turn output contract' profiles/fn/skills/fn-sentry-fix/SKILL.md
  grep -c 'NO progress/status messages' profiles/fn/skills/fn-sentry-fix/SKILL.md
  ```
  Expected: first command returns one line. Second command returns `0` (the old phrase fully removed).

### Task B.2 — Add progress message #1 at end of Phase 1

- [ ] **B.2.1** Locate the end of Phase 1 (just before `## Phase 2`). Find the last bullet/paragraph in Phase 1 (likely the slug derivation step). Add a new sub-section at the end of Phase 1:

  ```markdown
  ### Progress signal — Phase 1 complete

  Right after the `get_issue_details` call returns SUCCESS (issue exists, payload fetched, slug derived), emit ONE line of turn-text — exactly:

  ```
  🔍 investigando *<SENTRY-ID>*...
  ```

  Replace `<SENTRY-ID>` with the actual ID (e.g., `WORKER-D`). NO `<@user_id>` mention. NO other text on the same emission. Fires AT MOST once per invocation. If Phase 1 fails (404 / multi-issue / zero-issue), do NOT emit this signal — go directly to the relevant final template.
  ```

- [ ] **B.2.2** Verify placement:
  ```bash
  grep -n '🔍 investigando' profiles/fn/skills/fn-sentry-fix/SKILL.md
  grep -n '^## Phase ' profiles/fn/skills/fn-sentry-fix/SKILL.md
  ```
  Expected: the `🔍 investigando` line is BEFORE `## Phase 2` and AFTER `## Phase 1`.

### Task B.3 — Add progress message #2 at end of Phase 4

- [ ] **B.3.1** Locate the end of Phase 4 (just before `## Phase 5`). Add a new sub-section at the end of Phase 4:

  ```markdown
  ### Progress signal — Phase 4 gate PASS

  ONLY when ALL 5 gate items pass and you are about to invoke `Skill(zeno-development, ...)`, emit ONE line of turn-text — exactly:

  ```
  ✅ gate passou — partindo pro fix em `<owner>/<repo>`
  ```

  Replace `<owner>/<repo>` with the actual repo slug (e.g., `AcmeBooks/acme-monorepo`). NO `<@user_id>` mention. NO other text on the same emission. Fires AT MOST once per invocation. If ANY gate item fails, do NOT emit this signal — go directly to the Phase 4 stuck template.
  ```

- [ ] **B.3.2** Verify placement:
  ```bash
  grep -n '✅ gate passou' profiles/fn/skills/fn-sentry-fix/SKILL.md
  ```
  Expected: line number is between `## Phase 4` and `## Phase 5`.

### Task B.4 — Trim verbose sections

- [ ] **B.4.1** Drop the `docker_or_inside_container` dead-code block in Phase 7 Step 2 (it was added during spec 0055 Phase C iteration but is never used). Find it via `grep -n 'docker_or_inside_container' profiles/fn/skills/fn-sentry-fix/SKILL.md` — remove the entire block including surrounding paragraph if dedicated to it. Estimated savings: ~15 lines.

- [ ] **B.4.2** Compress the `git log -S` false-positive guard. Find it via `grep -n 'git log -S' profiles/fn/skills/fn-sentry-fix/SKILL.md` — collapse multi-line explanation to a 2-line note. Estimated savings: ~5 lines.

- [ ] **B.4.3** Condense the Sentry MCP tool table (Phase 1 area). If it lists each tool with multi-line descriptions, collapse to single-line entries. Estimated savings: ~10 lines.

- [ ] **B.4.4** Deduplicate Phase 5/6 stuck template structure. If both phases repeat identical field schemas, factor into one shared reference and link from the second. Estimated savings: ~10 lines.

- [ ] **B.4.5** Condense the `gh pr create` block in Phase 7. If it has redundant flag explanations or example output, trim to essentials. Estimated savings: ~8 lines.

### Task B.5 — Verify line cap + structural integrity

- [ ] **B.5.1** Final line count check:
  ```bash
  wc -l profiles/fn/skills/fn-sentry-fix/SKILL.md
  ```
  Expected: ≤480 lines (480 is hard cap; 470-475 is comfortable; >480 means more trimming needed).

- [ ] **B.5.2** Verify all 5 final templates are still byte-for-byte unchanged:
  ```bash
  grep -n '✅ \*sentry fix shipped\*\|⚠️ \*sentry fix stuck\*\|ℹ️ \*sentry fix' profiles/fn/skills/fn-sentry-fix/SKILL.md
  ```
  Expected: 5 matches (success + 3 stuck + auto-resolve). Each template body unchanged.

- [ ] **B.5.3** Verify frontmatter unchanged:
  ```bash
  sed -n '1,10p' profiles/fn/skills/fn-sentry-fix/SKILL.md
  ```
  Expected: `name: fn-sentry-fix` and `description: ...` lines exact same as HEAD.

- [ ] **B.5.4** Verify `LICENSE-APACHE-2.0` untouched:
  ```bash
  git diff HEAD profiles/fn/skills/fn-sentry-fix/LICENSE-APACHE-2.0
  ```
  Expected: no output (file unchanged).

- [ ] **B.5.5** Run self-review checklist from `plan.md`:
  - [ ] Frontmatter unchanged
  - [ ] Apache 2.0 attribution unchanged
  - [ ] Old "NO progress/status messages" paragraph completely REMOVED
  - [ ] New "Turn output contract" section present
  - [ ] Progress msg #1 at end of Phase 1 (after fetch success path), no @-mention
  - [ ] Progress msg #2 at end of Phase 4 (only on gate-pass), no @-mention
  - [ ] All 5 final templates byte-for-byte unchanged
  - [ ] LICENSE-APACHE-2.0 untouched
  - [ ] Line count ≤ 480
  - [ ] No new files in `profiles/fn/skills/fn-sentry-fix/`

### Task B.6 — Commit

- [ ] **B.6.1** Stage + commit:
  ```bash
  git add profiles/fn/skills/fn-sentry-fix/SKILL.md
  git commit -m "feat(fn-sentry-fix): v2 — turn output contract + 2 progress msgs + trim ≤480"
  ```

- [ ] **B.6.2** Verify commit landed:
  ```bash
  git log --oneline -1
  git diff --stat HEAD~1..HEAD
  ```
  Expected: only `profiles/fn/skills/fn-sentry-fix/SKILL.md` changed.

---

## Phase C — Hot-reload via dashboard PATCH

**Goal:** Apply the new SKILL.md body to the running fn worker without docker rebuild.

### Task C.1 — Identify the skill record

- [ ] **C.1.1** From the host, list skills via the API to get the skill ID:
  ```bash
  curl -s http://localhost:3000/api/skills | jq '.[] | select(.name == "fn-sentry-fix") | {id, name, source, profile}'
  ```
  Expected: one record with `source: "profile"`, `profile: "fn"`, and an `id` (UUID).

### Task C.2 — PATCH skill body

- [ ] **C.2.1** Read new SKILL.md content into a variable and PATCH:
  ```bash
  SKILL_ID="<id-from-C.1.1>"
  BODY=$(cat profiles/fn/skills/fn-sentry-fix/SKILL.md | jq -Rs .)
  curl -s -X PATCH "http://localhost:3000/api/skills/$SKILL_ID" \
    -H 'content-type: application/json' \
    -d "{\"body\": $BODY}" | jq .
  ```
  Expected: response shows updated `body` with new line count + updated `updatedAt`.

- [ ] **C.2.2** Smoke test — send a 1-msg ping in `C0EXAMPLE001` to verify cache invalidated:
  - Manual step: send `@zeno-agent oi` in the channel.
  - Expected: Zeno responds normally. If cache stuck, restart worker container: `pnpm run docker:logs` to confirm worker reloads.

- [ ] **C.2.3** Fallback if PATCH didn't apply (cache holds): force-restart the worker container:
  ```bash
  docker compose -f infra/docker-compose.fn.yml restart worker
  ```
  ~10s downtime, no rebuild needed.

---

## Phase D — E2E in channel C0EXAMPLE001

**Goal:** Validate live in the operator channel that v2 changes work: 2 progress messages flow correctly, no filler text emitted, all 3 scenarios pass.

### Task D.1 — Pre-flight signal check

- [ ] **D.1.1** Verify WORKER-V (S2 candidate) still has 1 event (gate-fail signal floor target). If event count grew to ≥3, pick a fresh 1-event issue:
  ```bash
  # via Sentry MCP — list 1-event unresolved issues
  # (manual: query mcp__sentry__list_issues with is:unresolved sort:freq, take bottom)
  ```
  Note: replace `WORKER-V` in S2 below with the actual fresh issue ID.

- [ ] **D.1.2** Verify Sentry comment token (REST API) still valid:
  ```bash
  pnpm run docker:sh
  # inside container:
  node -e "const {db}=require('./apps/worker/dist/...');db.connectorSecrets.findOne({...}).then(r=>console.log(r?'token ok':'token missing'))"
  ```
  Skip if too fragile — fallback note is in the success template anyway.

### Task D.2 — Run S1 (happy path)

- [ ] **D.2.1** In channel `C0EXAMPLE001`, send:
  ```
  @zeno-agent fn-sentry-fix https://flavia-nasser.sentry.io/issues/WORKER-D
  ```
  (or any well-formed bug with ≥3 events).

- [ ] **D.2.2** Expected sequence (3 Slack messages from Zeno, in this order):
  1. `🔍 investigando *WORKER-D*...` (no `<@user_id>`)
  2. `✅ gate passou — partindo pro fix em \`AcmeBooks/acme-monorepo\`` (no `<@user_id>`)
  3. `<@U0AMRKV0T25> ✅ *sentry fix shipped* — <PR_URL>` + 3 bullets (with `<@user_id>`)

- [ ] **D.2.3** Verify NO interim "Aguardando..." or other filler text appears anywhere in the thread.

- [ ] **D.2.4** Verify PR opened with `[zeno-test]` prefix in title.

- [ ] **D.2.5** Cleanup: close the test PR + delete the branch:
  ```bash
  gh pr close <PR-number> --delete-branch
  ```

- [ ] **D.2.6** Cleanup: ensure Sentry issue NOT marked resolved (per test rule).

### Task D.3 — Run S2 (stuck-gate)

- [ ] **D.3.1** In channel `C0EXAMPLE001`, send:
  ```
  @zeno-agent fn-sentry-fix https://flavia-nasser.sentry.io/issues/<1-event-issue-id>
  ```

- [ ] **D.3.2** Expected sequence (2 Slack messages from Zeno, in this order):
  1. `🔍 investigando *<ID>*...` (no `<@user_id>`)
  2. `<@U0AMRKV0T25> ⚠️ *sentry fix stuck*` + 4 fields (Confirmed / Hypothesis / Blocking / Question) (with `<@user_id>`)

- [ ] **D.3.3** Verify NO `✅ gate passou` message (gate failed, so progress signal #2 must NOT fire).

- [ ] **D.3.4** Verify NO PR opened, NO branch leftover.

### Task D.4 — Run S5 (bug regression — zero filler text)

- [ ] **D.4.1** Re-run S1 OR a fresh well-formed bug invocation. Watch the thread carefully for the "no assistant text outside the 6 allowed shapes" criterion.

- [ ] **D.4.2** Operationally verify: count Slack messages from Zeno in the thread. Each must match exactly one of the 6 allowed shapes (4 final + 2 progress). If ANY non-matching message appears (filler, code block, status update), this is a FAIL — investigate and re-edit SKILL.md.

### Task D.5 — Capture E2E results

- [ ] **D.5.1** Write results to `tmp/spec-0056-e2e-results.md` (NOT committed):
  ```markdown
  # Spec 0056 fn-sentry-fix v2 — E2E results

  Channel: C0EXAMPLE001
  Date: 2026-04-29

  | # | Scenario | Issue | Result | Notes |
  |---|---|---|---|---|
  | S1 | Happy path | WORKER-D | PASS / FAIL | <list 3 msgs received in order> |
  | S2 | Stuck-gate | <id> | PASS / FAIL | <list 2 msgs received in order> |
  | S5 | Bug regression | <id> | PASS / FAIL | <count messages, confirm all match 6 shapes> |
  ```

---

## Phase E — Final 3-round branch review

**Goal:** Per cleanup contract Rule 2, run R1/R2/R3 reviews of the entire branch (`feat/sentry-fix-skill-adjust` vs `feat/sentry-fix-skill`). Reset counter on any blocking finding.

### Task E.1 — R1 review

- [ ] **E.1.1** Run R1 review covering:
  - `git diff feat/sentry-fix-skill..HEAD -- profiles/fn/skills/fn-sentry-fix/SKILL.md`
  - All spec/plan/tasks files in `context/specs/0056-fn-sentry-fix-adjust/`
  - The 3 E2E scenario results in `tmp/spec-0056-e2e-results.md`
  - Self-review checklist from plan.md

  Categorize findings: BLOCKING / advisory / nit. If BLOCKING: fix, reset to R1.

### Task E.2 — R2 review

- [ ] **E.2.1** R2 review (same scope as R1). Reset to R1 on any BLOCKING.

### Task E.3 — R3 review

- [ ] **E.3.1** R3 review (same scope as R1). Reset to R1 on any BLOCKING.

  Only proceed to Phase F when R1+R2+R3 are CLEAN consecutive (no blocking findings).

---

## Phase F — Push + open PR

**Goal:** Push the branch and open the stacked PR targeting `feat/sentry-fix-skill`.

### Task F.1 — Push branch

- [ ] **F.1.1** Push:
  ```bash
  git push -u origin feat/sentry-fix-skill-adjust
  ```

### Task F.2 — Open PR

- [ ] **F.2.1** Open via `/open-pr` slash command (per project convention) OR `gh pr create`:
  ```bash
  gh pr create \
    --base feat/sentry-fix-skill \
    --head feat/sentry-fix-skill-adjust \
    --title "feat(fn-sentry-fix): v2 — turn output contract + 2 progress msgs + trim ≤480" \
    --body "$(cat <<'EOF'
  ## Summary
  - Replace the "NO progress/status messages" rule with an explicit "Turn output contract" section listing the 6 allowed turn-text shapes (4 final + 2 progress) and a DON'T list (filler, code blocks, status updates).
  - Authorize 2 short Slack progress messages (no `<@user_id>`): `🔍 investigando *<SENTRY-ID>*...` after Phase 1 fetch SUCCESS, `✅ gate passou — partindo pro fix em \`<owner>/<repo>\`` after Phase 4 gate PASS.
  - Trim verbose sections (drop `docker_or_inside_container` dead-code, compress `git log -S` guard, condense MCP tool table) to land at ≤480 lines per Anthropic skill best practices.

  ## Test plan
  - [x] S1 happy path in C0EXAMPLE001 → 3 msgs in order (progress #1 + progress #2 + final shipped + @-mention)
  - [x] S2 stuck-gate in C0EXAMPLE001 → 2 msgs in order (progress #1 + final stuck + @-mention, NO progress #2)
  - [x] S5 bug regression → no filler text outside 6 allowed shapes
  - [x] PR closed + branch deleted + Sentry issue NOT resolved (test rule)

  Stacked on #19 (`feat/sentry-fix-skill`).
  EOF
  )"
  ```

- [ ] **F.2.2** Return PR URL to user.

---

## Done criteria

- [x] All Phase A-F tasks complete (modulo divergence — see spec.md "Divergence from original design").
- [x] Final SKILL.md ≤ 480 lines (delivered at 467).
- [x] E2E scenarios validate clean final-template emission in C0EXAMPLE001 (S1 happy path round 4 + S2 stuck/clarification path). S5 zero-filler regression confirmed across all rounds.
- [x] Test PRs (#100, #101, #102, #103, #104) closed + branches deleted.
- [ ] R1+R2+R3 reviews CLEAN consecutive (Phase E in progress).
- [ ] PR open against `feat/sentry-fix-skill` (Phase F).

**Diverged from plan (documented in spec.md):**
- ~~3 E2E scenarios with progress messages~~ — progress messages dropped due to architectural blocker (worker only routes SDK `result` event, not intermediate `assistant` text).
- ~~6 allowed shapes (4 final + 2 progress)~~ → 4 final shapes + deferred-work note for progress msgs.
- 2 extra commits added during E2E (`18b89fc` + `8e32ab8`) to tighten contract enforcement after status-preamble leaks were observed.
