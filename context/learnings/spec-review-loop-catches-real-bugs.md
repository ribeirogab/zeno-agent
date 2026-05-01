---
tags:
  - learning
  - workflow
  - meta
related:
  - "[[../specs/2026-04-16-dashboard-crud/spec|spec 0013]]"
  - "[[../specs/2026-04-16-dashboard-logs/spec|spec 0014]]"
created: 2026-04-16
---
# The spec-document-reviewer loop catches real design bugs — don't skip it

The `brainstorming` skill's spec review loop (dispatch `spec-document-reviewer` subagent after writing the spec, iterate on issues, re-dispatch until approved) feels like overhead until you see what it actually catches. Across specs 0012, 0013, 0014 the reviewer flagged:

- **Spec 0012** — two findings in round 1: `sessions24h` stat had no defined SQL filter; SPA auth guard was calling an unauthenticated endpoint (`/api/health`) that would never 401. Both silent bugs in the design.
- **Spec 0013** — four findings in round 1: claimed `claimPending` semantics were ambiguous about atomicity; fire-and-forget UX timing ("within 2s") didn't account for concurrent `cron_run_now` blocking other handlers in a shared sequential tick; `cron_delete` race failure-mode description was wrong (the spec claimed markRun would fail silently; actually `ON DELETE CASCADE` removes the run row entirely); packaging decision for `loadMcpConfig` was left open but would affect the plan's file structure.
- **Spec 0014** — four findings in round 1: SSE `lastId` initialization was outside the `streamSSE` callback, creating a race; `q` search semantics (prefix vs substring, case sensitivity) were under-specified; retention sweep rationale conflated execution order with the `WHERE ts < ?` predicate; write-contention failure mode was under-emphasised in the Constraints section.

Every one of those would have become a subtle bug at implementation time, or caused the plan to be wrong.

## Context

The `spec-document-reviewer` is a subagent dispatched by the brainstorming skill with a briefing: the spec file path, the project conventions, specific areas to scrutinize. It doesn't see my session history — only what I tell it.

## How to Apply

- **Always run the review loop on substantive specs** (> ~150 lines, > 1 architectural decision). Skip only for tiny docs (one-screen spec for a single-file change).
- **Craft the briefing well.** Tell the reviewer: (a) project conventions to check against; (b) specific sections to scrutinize where you already suspect thin reasoning; (c) the context of prior specs this builds on. Vague briefings get vague reviews.
- **Fix everything before re-dispatching.** Don't ship partial fixes; batch and re-run. Two or three rounds is normal. More than three is a sign the spec needs a bigger rewrite, not incremental patches.
- **Treat advisory notes as free wins.** The reviewer distinguishes blocking issues from advisories. Advisories are usually small, and fixing them costs less than ignoring them.

## What not to do

- Don't just ask the reviewer "is this good?" — they need the adversarial prompt. The prompt template in the `brainstorming` skill docs is a good starting point; tailor it per spec.
- Don't merge the review into the main brainstorming. The reviewer needs to see the **artifact** (the written spec), not the conversation that led to it. That's the whole point of a separate agent.
