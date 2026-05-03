---
status: draft
feature: {{kebab-slug-of-feature}}
created: {{YYYY-MM-DD}}
shipped: null
---
# {{Feature Name}} — Spec

**Status:** Draft
**Scope:** {{one-sentence scope statement}}

## Context

{{why this feature exists, what triggered it, relevant constraints}}

## Problem Statement

{{what specific problem this feature solves}}

## Non-Goals

{{what this feature explicitly does NOT solve — prevents scope creep}}

## Constraints

{{technical, organizational, or timing constraints that shape the solution}}

## User Stories / Scenarios

{{numbered user flows or acceptance scenarios}}

## Acceptance Criteria

Each criterion must be a binary, observable check that someone other than the implementer can verify in under a minute. **No vague verbs** ("works well", "is fast", "is robust", "handles errors gracefully") — replace them with specific, measurable conditions. If a criterion cannot be verified without reading the implementation, it is not an acceptance criterion; rewrite it.

- [ ] {{ e.g. `POST /users` with a duplicate email returns 409 and body `{"code":"DUPLICATE_EMAIL"}` }}
- [ ] {{ e.g. p95 latency for `GET /feed` stays under 200ms with a 1k-row fixture }}
- [ ] {{ e.g. the migration script runs idempotently — running it twice on the same DB yields no diff }}
- [ ] {{ ... }}

Tick each `[x]` when verified. A spec is **not shippable** with empty or `{{placeholder}}` acceptance criteria — `/harness-review-spec` will reject it.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| {{risk}} | {{mitigation}} |

## Open Questions

{{use [NEEDS CLARIFICATION: specific question] markers for unresolved points}}
