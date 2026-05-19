---
feature: guardrails-approval
spec: "[[spec-guardrails-approval]]"
created: 2026-04-21
---
# Guardrails + Approval Flow — Plan

**For this spec:** `[[spec-guardrails-approval]]`

## Approach

The pipeline lives in a new module `apps/worker/src/guardrails/`. Every policy is a small file with a single `check()` function implementing `PolicyMiddleware`. `GuardedBackend` wraps `ClaudeCodeBackend` and injects the pipeline as the SDK's `canUseTool` callback — the wrapper itself implements `AgentBackend` and owns all policy composition. This preserves ports & adapters (backend stays focused on SDK mechanics), and adding a new policy later (rate limiting, cost tracking, allowlist) is purely additive: new file + one line in the pipeline array.

The classifier is a second `query()` call into the Claude Agent SDK with `allowedTools: []`, a dedicated tight system prompt, and the Haiku model. This reuses the existing OAuth token (constitution: "OAuth, not API key") instead of introducing a separate API-key-based path. Cost is ~1 cheap turn per sensitive-candidate tool call. Isolated client in `guardrails/classifier/haiku.ts` so cost/latency is observable and the prompt never drifts.

The approver uses a new `Channel.waitForReaction()` method implemented only for Slack in this spec. It registers a one-shot listener on `reaction_added`, filters by target `messageRef`, resolves on the first matching emoji from the expected reactor (owner), and auto-rejects on timeout. All in-memory: restart during pending approval = session dies, user repeats.

## Architecture

### Module layout

```
apps/worker/src/guardrails/
├── types.ts                      PolicyMiddleware, PolicyContext, Decision, ApprovalRequest, ClassifierResult
├── pipeline.ts                   runPolicyPipeline(ctx, middlewares): Decision
├── guarded-backend.ts            GuardedBackend implements AgentBackend; wraps ClaudeCodeBackend; owns canUseTool
├── config.ts                     ApprovalsConfig schema (zod) + loader from profile/config.yaml
├── classifier/
│   ├── haiku.ts                  HaikuClassifier.classify(toolName, input): Promise<ClassifierResult>
│   └── prompt.ts                 CLASSIFIER_SYSTEM_PROMPT constant
├── approver/
│   ├── slack-approver.ts         SlackApprover.requestApproval(req): posts + waits + returns Decision
│   └── format.ts                 formatApprovalMessage(req, mode): string
├── policies/
│   ├── always-sensitive.ts       matches always_sensitive list (literal + "prefix*" wildcard)
│   ├── read-only-skill.ts        checks skillReadOnly flag from ctx
│   ├── classifier-gate.ts        calls HaikuClassifier, short-circuits on sensitive
│   ├── approver-gate.ts          called by the two above via ctx.requestApproval
│   └── audit.ts                  terminal middleware; writes to ApprovalsLogRepo
└── skill-registry.ts             loadSkillRegistry(): { toolNameOrPattern → readOnly }

apps/worker/src/agent/backends/claude-code.ts
  [MODIFY] add canUseTool option to ClaudeCodeBackendOptions, forward to query()

apps/worker/src/agent/types.ts
  [NO CHANGE] AgentInput stays unchanged (wiring is at backend construction, not per-call)

apps/worker/src/channels/types.ts
  [MODIFY] add Channel.waitForReaction(target, emojis, timeoutMs): Promise<{emoji, userId} | null>

apps/worker/src/channels/slack/adapter.ts
  [MODIFY] implement waitForReaction using app.event('reaction_added')
  [MODIFY] add openDm(userId): Promise<string> to open DM with owner on demand

apps/worker/src/index.ts
  [MODIFY] buildBackend wraps result in GuardedBackend when approvals config present

packages/storage/src/migrations.ts
  [MODIFY] add migration 4: approvals_log table

packages/storage/src/repos/approvals-log.ts
  [CREATE] ApprovalsLogRepo.insert(entry); list/query methods for future dashboard

packages/storage/src/types.ts
  [MODIFY] export ApprovalsLogEntry, ApprovalDecision, PolicyThatGated types

packages/storage/src/index.ts
  [MODIFY] export ApprovalsLogRepo + types
```

### Runtime wiring (happy path)

```
┌───────────── apps/worker/src/index.ts ─────────────┐
│ 1. loadConfig (env)                                │
│ 2. loadApprovalsConfig (profile/config.yaml)       │
│ 3. open DB + run migrations (now includes migr. 4) │
│ 4. new ApprovalsLogRepo(db)                        │
│ 5. new SlackChannel(...)                           │
│ 6. if approvals config present:                    │
│      registry = loadSkillRegistry()                │
│      classifier = new HaikuClassifier(approvalsCfg)│
│      approver = new SlackApprover(slack, ownerId)  │
│      inner = new ClaudeCodeBackend({               │
│        ..., canUseTool: guardedCanUseTool })       │
│      backend = new GuardedBackend(inner,           │
│        pipeline, ctxFactory)                       │
│    else:                                           │
│      backend = new ClaudeCodeBackend({ ... })      │
│      log.warn('running unguarded')                 │
│ 7. new AgentCore({ backend, ... })                 │
└────────────────────────────────────────────────────┘
```

Inside `GuardedBackend.query(input)`:
1. Build per-call `canUseTool` closure that knows the current `correlationId`, `requesterUserId` (derived from the input's slack_context preamble), and the pre-built `pipeline`.
2. Delegate to `this.inner.query({ ...input, canUseTool: thisClosure })`.
3. Inner backend forwards to SDK. SDK calls the closure for every tool.
4. Closure builds `PolicyContext`, runs `pipeline`, returns `PermissionResult` (`{ behavior: 'allow' }` or `{ behavior: 'deny', message }`).

### Extraction of requester user id

Today, `AgentCore` prepends `[slack_context]` with `user_id: <id>` into `userMessage` before calling backend. GuardedBackend reuses this: parses the `user_id:` line from the first 500 chars of `input.userMessage` (stable, cheap, no new plumbing). If not found → assume non-owner → worker mode (safer default).

Alternative considered: extend `AgentInput` with a structured `requesterUserId`. Rejected to keep the interface stable; parsing is trivial and colocated in `guarded-backend.ts`.

### Pipeline order (canonical — matches spec)

```
1. alwaysSensitiveGate   (absolute override)
2. readOnlySkillBypass   (fast allow, skips classifier)
3. classifierGate        (may invoke approverGate on sensitive)
4. [fallthrough → auto_allow]
5. auditLog              (terminal, always runs)
```

`approverGate` is not a positional step — it's invoked by `alwaysSensitiveGate` or `classifierGate` via `ctx.requestApproval`. This keeps the order flat and short-circuit rules obvious.

### Config schema (zod)

```ts
const ApprovalsSchema = z.object({
  owner_slack_user_id: z.string().regex(/^U[A-Z0-9]+$/),
  always_sensitive: z.array(z.string()).default([]),
  approval_timeout_sec: z.number().int().min(10).max(3600).default(300),
  classifier_model: z.string().default('claude-haiku-4-5'),
}).optional();
```

Loader returns `null` when absent → callers treat as "guardrails off".

## File Structure

See module layout above. One-line responsibilities:

- `types.ts` — vocabulary of the guardrails module (interfaces only, zero logic).
- `pipeline.ts` — pure function: runs middlewares in order, short-circuits on Decision.
- `guarded-backend.ts` — implements `AgentBackend`; constructs `PolicyContext` per tool call; wires SDK `canUseTool`.
- `config.ts` — parses `approvals:` section from `profile/config.yaml`.
- `skill-registry.ts` — scans `agent/skills/*/SKILL.md` + `profiles/<name>/skills/*/SKILL.md` frontmatter for `read_only: true`; returns a map `skillName → bool`. The heuristic for mapping a tool to a skill: `mcp__<server>__<tool>` → skill name = `<server>` (documented assumption, matches today's MCP naming convention via `mcp.json`).
- `classifier/haiku.ts` — single `classify(toolName, input)` method using `query()` with `allowedTools: []`, `model: <configured>`, short timeout (10s), 100 output tokens max. Returns `{ sensitive, reason }` or throws on failure.
- `classifier/prompt.ts` — the classifier system prompt as a constant string.
- `approver/slack-approver.ts` — `requestApproval(req)`: builds message, chooses target (thread vs DM via `conversations.open`), posts, calls `waitForReaction`, returns Decision.
- `approver/format.ts` — pure: builds approval message strings (owner thread vs worker DM variants).
- `policies/*.ts` — each exports a factory `make<Name>Policy(deps): PolicyMiddleware`.
- `policies/audit.ts` — terminal. Receives the effective Decision via a mutable ref in PolicyContext or by running twice (see implementation decision below).

### Audit placement decision

Audit is terminal — it needs to know the decision that *just happened*. Two ways:
(a) `pipeline.ts` runs all non-terminal policies, captures the result, then calls `auditLog.check(ctx, finalDecision)` with an extra param.
(b) Pipeline mutates a shared `ctx.trace: { policy, decision }[]` and `auditLog` reads it.

Choice: **(a)**. Cleaner: `auditLog` has a distinct signature `audit(ctx, decision)`, not misrepresented as a `PolicyMiddleware`. `pipeline.ts` accepts `{ policies, audit }` shape.

## Phase Ordering

Phases are ordered to keep each phase independently shippable (commit at end of each).

- **Phase 0 — Resolve open questions from spec.** Confirm model ID, Slack app scopes, skill→MCP mapping heuristic. No code; just capture findings in a learning note `context/learnings/guardrails-open-questions-resolved.md` (or inline this plan if trivial).
- **Phase 1 — Storage foundations.** Add migration 4 (`approvals_log`), create `ApprovalsLogRepo`, export from `@zeno/storage`. Pure storage work, testable in isolation.
- **Phase 2 — Config + types.** Create `guardrails/config.ts` (zod schema + loader) and `guardrails/types.ts` (interfaces). Depends on phase 1 only for `ApprovalDecision` / `PolicyThatGated` types, which can be co-owned by storage.
- **Phase 3 — ClaudeCodeBackend extension.** Add `canUseTool` constructor option; thread it into `query()`. Unit-testable with a mock `CanUseTool`.
- **Phase 4 — Channel interface.** Extend `Channel` with `waitForReaction` + `openDm`. Implement both in `SlackChannel`. Add unit test with mocked Bolt app.
- **Phase 5 — Policies (leaf modules, independent).**
  - 5a. `alwaysSensitivePolicy` — literal match + `prefix*` wildcard.
  - 5b. `readOnlySkillPolicy` — uses `skillRegistry` to check tool's skill.
  - 5c. `classifier/haiku.ts` — classifier client (can be built without policies).
  - 5d. `classifierGatePolicy` — uses classifier; short-circuits via ctx.requestApproval.
  - 5e. `approver/slack-approver.ts` — uses Channel; returns Decision.
  - 5f. `audit.ts` — writes to ApprovalsLogRepo.
- **Phase 6 — Pipeline + GuardedBackend.** Compose everything. Full unit test with all policies mocked, then an integration test with real pipeline + mock SDK.
- **Phase 7 — Boot wiring.** Modify `apps/worker/src/index.ts` to conditionally build `GuardedBackend`. Smoke test on `profiles/default`.
- **Phase 8 — Documentation + learnings.** Update `profiles/default/config.example.yaml` with the new `approvals` section commented. Write 1-2 learnings (e.g., "classifier reuses OAuth via agent SDK query", "always_sensitive order matters").

Phases 1–5 can run in parallel after phase 0. Phase 6 gates on all of them. Phase 7 gates on 6.

## Risks / Open Decisions

| Risk / Decision | Resolution |
|---|---|
| Classifier OAuth vs API key | Use SDK `query()` with empty tools, reuses `CLAUDE_CODE_OAUTH_TOKEN`. Documented in classifier client. |
| Classifier prompt drift over time | System prompt is a constant in `classifier/prompt.ts` and covered by unit tests with fixed inputs. Changes require PR. |
| `requesterUserId` parsing brittleness | Reuse exactly the `[slack_context]` format emitted by `AgentCore.wrapWithSlackContext`. Both sides reference the same shape; add a shared constant if drift is observed. |
| `reaction_added` listener leaks | `waitForReaction` registers listener, `finally`-cleans unconditionally. Add vitest timeout guard. |
| DM open fails (Slack scope missing) | Fail-safe deny + log. Spec flagged this: the Slack app manifest must include `im:write` + `chat:write` for DMs. Phase 0 confirms current manifest. |
| Timeout race (approver receives reaction at ~timeoutMs) | `Promise.race` between reaction and timeout; whoever wins first decides. Tie → deny (fail-safe). |
| Biome-ignore violations in `claude-code.ts` carried from MVP (mentioned in review) | Not in scope. Open question: should we fix as drive-by while we touch the file? **Decision: no.** Keeps PR focused. Existing violations tracked in backlog tech-debt row. |
| Skill registry cache invalidation (profile hot-reload) | MVP: load once at boot. Hot-reload of skills → already requires container restart for MCP changes (see `onMcpChanged` in watcher). Same rule applies here. Document in skill-registry.ts. |
| Pipeline ordering hardcoded | Fine for MVP. Future policies (rate-limit, cost) can slot anywhere in the fixed array. If dynamic ordering ever matters, that's a future refactor. |
