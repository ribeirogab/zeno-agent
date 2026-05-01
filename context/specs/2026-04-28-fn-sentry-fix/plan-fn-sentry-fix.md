---
feature: fn-sentry-fix
spec: "[[spec-fn-sentry-fix]]"
created: 2026-04-28
---
# fn-sentry-fix Skill — Plan

**For this spec:** `[[spec-fn-sentry-fix]]`

## Approach

This is a content-authoring spec. The deliverable is a single profile skill (`profiles/fn/skills/fn-sentry-fix/SKILL.md`) + `LICENSE-APACHE-2.0` text file. NO new code in `apps/` or `packages/`. The skill body composes pre-existing infrastructure: `zeno-development` skill (cloning + worktree + PR), Sentry MCP (issue discovery + Seer + update_issue), GitHub MCP (PR creation), Slack channel adapter (notifications). Boot-time materializer (spec 0053) picks the skill up automatically as a `profile`-source skill on next docker boot.

The 7-phase workflow mirrors Sentry's official `sentry-fix-issues` (Apache 2.0) with three Zeno-specific additions: (1) `zeno-development` handoff for fix execution, (2) explicit half-PR confidence gate between hypothesis and fix, (3) Slack escalation on stuck.

Implementation breaks into 4 phases: **A** = author skill body + LICENSE, **B** = docker boot verification, **C** = E2E via Slack on real Sentry issues, **D** = final review + push + PR. Phase A is the bulk of the work (skill body is ~10-15 KB markdown). Phases B-D are verification.

## Architecture

### File structure

```
profiles/fn/skills/fn-sentry-fix/
├── SKILL.md             # the playbook itself — 7-phase workflow
└── LICENSE-APACHE-2.0   # full Apache 2.0 license text (per license obligation §4)
```

No other files touched.

### Composition diagram

```
Slack mention
    ↓
SDK auto-discovery (description-match) injects fn-sentry-fix body
    ↓
fn-sentry-fix orchestrates:
    ├─ Phase 1: Discovery — Sentry MCP (get_issue_details)
    ├─ Phase 2: Deep Analysis — Sentry MCP (search_issue_events, get_trace_details, etc + Seer)
    ├─ Phase 3: Repo cross-reference + auto-resolve stale
    │   └─ git log -S<symbol> on the cloned bare
    │   └─ Sentry MCP update_issue (if stale)
    ├─ Phase 4: Confidence Gate (5-item self-evaluation)
    │   └─ FAIL → Slack stuck-message + STOP
    ├─ Phase 5: zeno-development handoff (THE existing skill)
    │   ├─ Clone bare + worktree
    │   ├─ Regression test FIRST (synthetic data, mocks externals, real fs via tmpdir)
    │   ├─ Edit-test loop ≤3 iterations
    │   └─ STUCK → cleanup branch + Slack stuck
    ├─ Phase 6: Verification (quality gate, toggle-fix re-test, blast radius)
    └─ Phase 7: Delivery
        ├─ git push (zeno-development)
        ├─ gh pr create --draft (full command, override zeno-development default)
        ├─ Sentry MCP update_issue (PR link comment)
        └─ Slack notify (success template) → channel C0EXAMPLE001
```

### What ships vs what's reused

| Component | Status |
|---|---|
| `profiles/fn/skills/fn-sentry-fix/SKILL.md` | NEW — this spec ships it |
| `profiles/fn/skills/fn-sentry-fix/LICENSE-APACHE-2.0` | NEW — license obligation |
| `agent/skills/zeno-development/` | Reused (composed) |
| Sentry MCP server config | Reused (already installed) |
| GitHub MCP / `github-app-fnlivros` | Reused |
| Slack channel adapter | Reused |
| Boot materializer (spec 0053) | Reused — auto-picks-up the new skill |
| `bootSkillsReconcile` | Reused — INSERT OR IGNORE for `profile` source |
| Connector-permission gate (spec 0050/0052) | Reused — gates Sentry/GitHub/Slack tool calls |

## File Structure

### New
- `profiles/fn/skills/fn-sentry-fix/SKILL.md` — workflow playbook
- `profiles/fn/skills/fn-sentry-fix/LICENSE-APACHE-2.0` — Apache 2.0 license text

### Modified
None. (No code changes; no test changes; no config changes; no docs changes outside the spec dir.)

### Deleted
None.

## Phase Ordering

```
A. Author skill body + LICENSE
   ↓
B. Docker boot verification (materializer picks it up + dashboard shows it)
   ↓
C. E2E via Slack on real Sentry issues (S1 happy / S2 stale / S3 stuck)
   ↓
D. Final 3-round review + push + PR (with explicit OK)
```

Hard ordering — each phase blocks the next.

## Risks / Open Decisions

- **Skill auto-discovery calibration.** SDK uses skill `description` to decide whether to inject. Description must match Sentry-related intents in PT-BR + EN ("fix sentry issue", "investiga essa issue do sentry", URLs to sentry.io) without over-triggering on non-Sentry mentions. Iterate during Phase C if E2E shows misfires.
- **Sentry MCP `update_issue` schema verification.** Spec says agent verifies field name (`note` vs `comment` vs other) at runtime. This is on the agent during execution, not the implementer. Implementer hardcodes the spec's recommended call shape; if Sentry MCP rejects it at runtime, the agent's runtime fallback handles it.
- **PR draft override duplication.** Phase 7 Step 1 instructs the agent to issue the FULL `gh pr create --draft ...` command rather than delta-patching zeno-development's. This is a deliberate deviation; it duplicates the command shape but eliminates any "is this a delta or replacement?" ambiguity during execution.
- **fs-related bug reproducibility.** Phase 5 says "use tmpdir for fs bugs, don't mock fs primitive". Implementer doesn't choose this — agent does at execution time per project. Implementer just writes the rule into the skill body.
- **License obligation.** Apache 2.0 §4(a)(b) requires recipients receive a copy of the License. We ship `LICENSE-APACHE-2.0` next to `SKILL.md`. Spec 0053's materializer copies the SKILL.md only (not the directory), so the license file lives in the source repo and operator-side dashboard but does NOT need to land in the agent's runtime skills dir for the agent to function. License obligation is on the source repo; this is fulfilled.
- **E2E requires real Sentry issues.** Phase C needs at least 3 distinct issue states: a clean reproducible bug, a stale issue (already-fixed in HEAD), and a weak-signal issue. Operator (Operator) may need to plant or find issues that match these states on the fn Sentry org. If real issues aren't available, simulate by creating test events.

## Self-Review

After authoring the skill body in Phase A, verify against the spec's Decisions table + Success Criteria. Missing items → fix in skill body before Phase B. Specifically:

- [ ] All 5 confidence gate items are present + worded objectively
- [ ] Cost caps documented (≤20 / ≤30 / ≤3 / ≤55)
- [ ] Sentry MCP tool list complete (search_issues, get_issue_details, search_issue_events, get_issue_tag_values, get_trace_details, analyze_issue_with_seer, update_issue, get_event_attachment)
- [ ] Slack templates: success + stuck (Phase 4 stuck) + stuck (Phase 5 stuck) + stuck (Phase 6 stuck) all present, all use Slack mrkdwn
- [ ] PR description template uses N/A pattern for optional fields
- [ ] Apache 2.0 attribution at top of SKILL.md
- [ ] Multi-issue + zero-issue Slack handlers
- [ ] Auto-resolve stale path with self-contained audit trail in Sentry note
- [ ] Branch cleanup commands (`git -C "${BARE}" worktree remove ... --force` + `git -C "${BARE}" branch -D ...`) for every stuck path
- [ ] PR override: full `gh pr create --draft` command spelled out
- [ ] Security rules: untrusted external input, cross-reference repo, no PII, synthetic test data
