---
feature: guardrails-approval
plan: "[[plan]]"
spec: "[[spec]]"
created: 2026-04-21
---
# Guardrails + Approval Flow — Tasks

**For this plan:** `[[plan]]`

Each task is independently committable. TDD loop is `write failing test → run (fail) → implement → run (pass) → commit`. Skip placeholder steps; code blocks show the actual content.

Quality gate: `pnpm run quality-gate` passes at the end of each commit. Never commit with failing typecheck/lint.

---

## Phase 0 — Open questions

### Task 0.1: Resolve spec clarifications

- [ ] Verify current Slack app manifest includes `im:write`, `chat:write`, `reactions:read`, `reactions:write`. If missing, note in plan and surface to user before proceeding.

  ```bash
  # Search for manifest/scopes documentation in the repo
  ```
  Check files: `infra/`, `context/specs/2026-04-15-slack-zeno-mvp/`, and any `manifest.yaml` or `slack-app.json`. If manifest isn't versioned, document current Slack app scopes as discovered.

- [ ] Confirm classifier model ID. Acceptable: `claude-haiku-4-5`. Check `@anthropic-ai/claude-agent-sdk` package or docs if that ID needs a suffix (e.g., `-20251001`). Write findings to plan.md Risks section if deviating from spec default.

- [ ] Confirm skill → MCP server naming by reading `apps/worker/src/agent/mcp.ts` and `agent/skills/cron-management/SKILL.md`. Document in a short learning note `context/learnings/skill-mcp-server-naming.md` if not already covered.

- [ ] Commit:
  ```bash
  git add context/learnings/ context/specs/2026-04-21-guardrails-approval/plan.md
  git commit -m "docs(0023): resolve spec open questions"
  ```

---

## Phase 1 — Storage foundations

### Task 1.1: Add `approvals_log` migration

**Files:**
- Modify: `packages/storage/src/migrations.ts` (append migration id=4)

- [ ] Step 1: Write failing test `packages/storage/src/__tests__/migrations.test.ts` (create if absent) that opens an in-memory DB, runs migrations, and queries `PRAGMA table_info(approvals_log)` expecting the columns listed in the spec.

- [ ] Step 2: Run `pnpm --filter @zeno/storage test` — expect fail (table missing).

- [ ] Step 3: Add migration id=4 at the end of the `MIGRATIONS` array:

  ```ts
  {
    id: 4,
    name: 'approvals_log',
    sql: `
  CREATE TABLE approvals_log (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    profile            TEXT NOT NULL,
    correlation_id     TEXT NOT NULL,
    thread_id          TEXT,
    requester_user_id  TEXT NOT NULL,
    decider_user_id    TEXT,
    tool_name          TEXT NOT NULL,
    tool_input         TEXT NOT NULL,
    policy_that_gated  TEXT NOT NULL,
    classifier_reason  TEXT,
    decision           TEXT NOT NULL CHECK (decision IN ('allow','deny')),
    decision_reason    TEXT NOT NULL,
    created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX idx_approvals_log_profile_created ON approvals_log(profile, created_at DESC);
  CREATE INDEX idx_approvals_log_correlation ON approvals_log(correlation_id);
  `,
  },
  ```

- [ ] Step 4: Run tests — expect pass. Also rerun on a re-opened DB in the same test to verify idempotency.

- [ ] Step 5: Commit:
  ```bash
  git add packages/storage/src/migrations.ts packages/storage/src/__tests__/
  git commit -m "feat(storage): add approvals_log migration"
  ```

### Task 1.2: Create `ApprovalsLogRepo`

**Files:**
- Create: `packages/storage/src/repos/approvals-log.ts`
- Modify: `packages/storage/src/types.ts`, `packages/storage/src/index.ts`
- Test: `packages/storage/src/__tests__/approvals-log.test.ts`

- [ ] Step 1: Add types to `packages/storage/src/types.ts`:

  ```ts
  export type ApprovalDecision = 'allow' | 'deny';
  export type PolicyThatGated =
    | 'always_sensitive'
    | 'read_only'
    | 'classifier'
    | 'auto_allow'
    | 'timeout'
    | 'classifier_unavailable'
    | 'approver_channel_error';

  export interface ApprovalsLogEntry {
    id: number;
    profile: string;
    correlationId: string;
    threadId: string | null;
    requesterUserId: string;
    deciderUserId: string | null;
    toolName: string;
    toolInput: string;
    policyThatGated: PolicyThatGated;
    classifierReason: string | null;
    decision: ApprovalDecision;
    decisionReason: string;
    createdAt: string;
  }

  export type CreateApprovalsLogEntry = Omit<ApprovalsLogEntry, 'id' | 'createdAt'>;
  ```

- [ ] Step 2: Write failing test `approvals-log.test.ts` that inserts an entry and reads it back via `listByCorrelation`.

- [ ] Step 3: Run tests — expect fail.

- [ ] Step 4: Implement `ApprovalsLogRepo` with `insert(entry)` and `listByCorrelation(correlationId)`. Mirror the style of `sessions.ts`.

- [ ] Step 5: Export from `packages/storage/src/index.ts`.

- [ ] Step 6: Run `pnpm --filter @zeno/storage test` — expect pass.

- [ ] Step 7: Commit:
  ```bash
  git add packages/storage/
  git commit -m "feat(storage): add ApprovalsLogRepo"
  ```

---

## Phase 2 — Guardrails config + types

### Task 2.1: Approvals config schema + loader

**Files:**
- Create: `apps/worker/src/guardrails/config.ts`
- Test: `apps/worker/src/guardrails/__tests__/config.test.ts`

- [ ] Step 1: Failing test with three cases: (a) valid config returns parsed object, (b) missing `approvals:` section returns `null`, (c) invalid owner_slack_user_id throws.

- [ ] Step 2: Run — fail.

- [ ] Step 3: Implement `loadApprovalsConfig()` reading from `profile/config.yaml` via the same loader pattern as `loadStaticCrons`. Define `ApprovalsConfig` type. Zod schema per plan.md. Emit `config_unknown_section` warning logic is already done at top-level loader — add `approvals` to `KNOWN_SECTIONS` in `apps/worker/src/cron/static-loader.ts` so it isn't flagged as unknown.

- [ ] Step 4: Run tests — pass.

- [ ] Step 5: Commit:
  ```bash
  git add apps/worker/src/guardrails/ apps/worker/src/cron/static-loader.ts
  git commit -m "feat(guardrails): config schema + loader"
  ```

### Task 2.2: Guardrails types

**Files:**
- Create: `apps/worker/src/guardrails/types.ts`

- [ ] Step 1: Implement (no tests needed — interfaces only):

  ```ts
  import type { PolicyThatGated } from '@zeno/storage';

  export type Decision =
    | { allow: true; reason: string; policyThatGated: PolicyThatGated }
    | { allow: false; reason: string; policyThatGated: PolicyThatGated };

  export interface ApprovalRequest {
    toolName: string;
    toolInput: Record<string, unknown>;
    classifierReason: string | null;
    requesterUserId: string;
    threadId: string | null;
    conversationId: string;
    isOwner: boolean;
    ownerUserId: string;
  }

  export interface ApproverResult {
    decision: Decision;
    deciderUserId: string | null;
  }

  export interface PolicyContext {
    toolName: string;
    toolInput: Record<string, unknown>;
    skillReadOnly: boolean;
    isOwner: boolean;
    ownerUserId: string;
    requesterUserId: string;
    correlationId: string;
    threadId: string | null;
    conversationId: string;
    profile: string;
    classifierReason: string | null; // filled in by classifierGate when it runs
    requestApproval: (req: ApprovalRequest) => Promise<ApproverResult>;
  }

  export interface PolicyMiddleware {
    name: string;
    check(ctx: PolicyContext): Promise<Decision | undefined>; // undefined = pass-through
  }

  export interface ClassifierResult {
    sensitive: boolean;
    reason: string;
  }
  ```

- [ ] Step 2: Run `pnpm --filter @zeno/worker typecheck` — pass.

- [ ] Step 3: Commit:
  ```bash
  git add apps/worker/src/guardrails/types.ts
  git commit -m "feat(guardrails): core types"
  ```

---

## Phase 3 — ClaudeCodeBackend extension

### Task 3.1: Add `canUseTool` option

**Files:**
- Modify: `apps/worker/src/agent/backends/claude-code.ts`
- Test: `apps/worker/src/agent/backends/__tests__/claude-code-canuse.test.ts`

- [ ] Step 1: Failing test that constructs `ClaudeCodeBackend` with a `canUseTool` mock; runs `query()` against a scripted SDK fixture (mock `query` from SDK) and asserts the callback was forwarded.

  Existing tests already mock the SDK — follow the same pattern. If no mocking helper exists, inline `vi.mock('@anthropic-ai/claude-agent-sdk', ...)`.

- [ ] Step 2: Run — fail.

- [ ] Step 3: Modify `ClaudeCodeBackendOptions`:

  ```ts
  import type { CanUseTool } from '@anthropic-ai/claude-agent-sdk';
  // ...
  interface ClaudeCodeBackendOptions {
    timeoutMs?: number;
    allowedTools?: string[];
    mcpServers?: Record<string, McpServerConfig>;
    inProcessMcpServers?: Record<string, InProcessMcpServer>;
    canUseTool?: CanUseTool;
  }
  ```

  In the constructor store `this.canUseTool = opts.canUseTool`. In `query()` options, add:

  ```ts
  ...(this.canUseTool ? { canUseTool: this.canUseTool } : {}),
  ```

  When `canUseTool` is provided, also change `permissionMode` from `'bypassPermissions'` to `'default'` (SDK requires the hook path is active). Gate that: if `canUseTool` is set → `permissionMode: 'default'`; else keep `'bypassPermissions'`.

- [ ] Step 4: Run tests — pass.

- [ ] Step 5: Commit:
  ```bash
  git add apps/worker/src/agent/backends/
  git commit -m "feat(agent): ClaudeCodeBackend accepts canUseTool hook"
  ```

---

## Phase 4 — Channel interface

### Task 4.1: Extend `Channel` interface

**Files:**
- Modify: `apps/worker/src/channels/types.ts`

- [ ] Step 1: Add methods:

  ```ts
  export interface ReactionEvent {
    emoji: string;
    userId: string;
  }

  export interface Channel {
    // ... existing
    waitForReaction(
      target: MessageTarget,
      emojis: string[],
      timeoutMs: number,
      expectedUserId?: string,
    ): Promise<ReactionEvent | null>;
    openDm(userId: string): Promise<string>; // returns conversationId of the DM
  }
  ```

- [ ] Step 2: Run typecheck — `SlackChannel` now fails compile. Expected.

- [ ] Step 3: Commit:
  ```bash
  git add apps/worker/src/channels/types.ts
  git commit -m "feat(channels): add waitForReaction + openDm to Channel"
  ```

### Task 4.2: Implement in `SlackChannel`

**Files:**
- Modify: `apps/worker/src/channels/slack/adapter.ts`
- Test: `apps/worker/src/channels/slack/__tests__/wait-reaction.test.ts`

- [ ] Step 1: Failing test that mocks the Bolt `App`, calls `waitForReaction`, simulates a `reaction_added` event, asserts the promise resolves with the emoji + user id.

- [ ] Step 2: Fail.

- [ ] Step 3: Implement `waitForReaction`:

  ```ts
  async waitForReaction(
    target: MessageTarget,
    emojis: string[],
    timeoutMs: number,
    expectedUserId?: string,
  ): Promise<ReactionEvent | null> {
    if (!target.messageRef) return null;
    return new Promise((resolve) => {
      let settled = false;
      const settle = (value: ReactionEvent | null): void => {
        if (settled) return;
        settled = true;
        this.app.off?.('reaction_added', listener);
        clearTimeout(timer);
        resolve(value);
      };
      // biome-ignore lint/suspicious/noExplicitAny: Bolt event typed loosely
      const listener = async ({ event }: { event: any }): Promise<void> => {
        if (event.item?.ts !== target.messageRef) return;
        if (event.item?.channel !== target.conversationId) return;
        if (!emojis.includes(event.reaction)) return;
        if (expectedUserId && event.user !== expectedUserId) return;
        settle({ emoji: event.reaction, userId: event.user });
      };
      this.app.event('reaction_added', listener);
      const timer = setTimeout(() => settle(null), timeoutMs);
    });
  }
  ```

  `app.off` may not exist on all Bolt versions — if absent, use a `settled` flag and ignore late events (listener stays registered but is a no-op).

  Implement `openDm`:

  ```ts
  async openDm(userId: string): Promise<string> {
    const result = await this.app.client.conversations.open({
      token: this.opts.botToken,
      users: userId,
    });
    const id = result.channel?.id;
    if (!id) throw new Error('conversations.open returned no channel id');
    return id;
  }
  ```

- [ ] Step 4: Tests pass.

- [ ] Step 5: Commit:
  ```bash
  git add apps/worker/src/channels/slack/
  git commit -m "feat(slack): implement waitForReaction + openDm"
  ```

---

## Phase 5 — Policies

### Task 5.1: `alwaysSensitivePolicy`

**Files:**
- Create: `apps/worker/src/guardrails/policies/always-sensitive.ts`
- Test: `apps/worker/src/guardrails/policies/__tests__/always-sensitive.test.ts`

- [ ] Step 1: Failing tests:
  - literal match (`mcp__github__merge_pull_request`) → calls `ctx.requestApproval`, returns its decision.
  - wildcard match (`mcp__github__*` matches `mcp__github__delete_repo`) → same.
  - no match → returns `undefined`.

- [ ] Step 2: Fail.

- [ ] Step 3: Implement:

  ```ts
  export function makeAlwaysSensitivePolicy(patterns: string[]): PolicyMiddleware {
    return {
      name: 'always_sensitive',
      async check(ctx) {
        const match = patterns.some((p) =>
          p.endsWith('*') ? ctx.toolName.startsWith(p.slice(0, -1)) : ctx.toolName === p,
        );
        if (!match) return undefined;
        const { decision } = await ctx.requestApproval({
          toolName: ctx.toolName,
          toolInput: ctx.toolInput,
          classifierReason: null,
          requesterUserId: ctx.requesterUserId,
          threadId: ctx.threadId,
          conversationId: ctx.conversationId,
          isOwner: ctx.isOwner,
          ownerUserId: ctx.ownerUserId,
        });
        return { ...decision, policyThatGated: 'always_sensitive' };
      },
    };
  }
  ```

- [ ] Step 4: Tests pass.

- [ ] Step 5: Commit:
  ```bash
  git add apps/worker/src/guardrails/policies/always-sensitive.ts apps/worker/src/guardrails/policies/__tests__/
  git commit -m "feat(guardrails): alwaysSensitive policy"
  ```

### Task 5.2: `readOnlySkillPolicy`

**Files:**
- Create: `apps/worker/src/guardrails/skill-registry.ts`, `apps/worker/src/guardrails/policies/read-only-skill.ts`
- Test: `__tests__/read-only-skill.test.ts`

- [ ] Step 1: Implement `skill-registry.ts`:
  - Scan `/app/agent/skills/*/SKILL.md` and `/app/profile/skills/*/SKILL.md` (+ fallbacks `agent/skills`, `profile/skills` per existing candidates).
  - Parse frontmatter; if `read_only: true`, add `<skillName> → true` to map.
  - Export `loadSkillRegistry(): Map<string, boolean>` and a helper `isToolReadOnly(registry, toolName)` that does `mcp__<server>__<tool>` → looks up `<server>`.

- [ ] Step 2: Failing tests for both `loadSkillRegistry` (with a fs mock) and the policy (`isToolReadOnly` → allow).

- [ ] Step 3: Implement policy:

  ```ts
  export function makeReadOnlySkillPolicy(registry: Map<string, boolean>): PolicyMiddleware {
    return {
      name: 'read_only_skill',
      async check(ctx) {
        if (!ctx.skillReadOnly) return undefined;
        return { allow: true, reason: 'skill declared read_only: true', policyThatGated: 'read_only' };
      },
    };
  }
  ```

  The `ctx.skillReadOnly` boolean is set by `GuardedBackend` using the registry + tool name. Keep the policy dumb — all inference lives at context construction.

- [ ] Step 4: Tests pass.

- [ ] Step 5: Commit:
  ```bash
  git add apps/worker/src/guardrails/skill-registry.ts apps/worker/src/guardrails/policies/read-only-skill.ts apps/worker/src/guardrails/policies/__tests__/
  git commit -m "feat(guardrails): read_only skill bypass"
  ```

### Task 5.3: Haiku classifier client

**Files:**
- Create: `apps/worker/src/guardrails/classifier/prompt.ts`, `apps/worker/src/guardrails/classifier/haiku.ts`
- Test: `__tests__/haiku.test.ts`

- [ ] Step 1: Write `prompt.ts` with the classifier system prompt (copy from spec's Section 3). Include fixed output JSON contract.

- [ ] Step 2: Failing test mocking SDK `query` to emit a `result` message with `{"sensitive": true, "reason": "..."}` as text. Assert `classify()` returns parsed object.

- [ ] Step 3: Implement `HaikuClassifier`:

  ```ts
  export class HaikuClassifier {
    constructor(private readonly opts: { model: string; timeoutMs?: number }) {}

    async classify(toolName: string, input: Record<string, unknown>): Promise<ClassifierResult> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs ?? 10_000);
      try {
        const iter = query({
          prompt: JSON.stringify({ tool: toolName, input }),
          options: {
            systemPrompt: CLASSIFIER_SYSTEM_PROMPT,
            allowedTools: [],
            model: this.opts.model,
            permissionMode: 'bypassPermissions',
            abortController: controller,
            persistSession: false,
            settingSources: ['user'],
          },
        });
        let text = '';
        for await (const msg of iter) {
          if (msg.type === 'result' && 'result' in msg && typeof msg.result === 'string') {
            text = msg.result;
          }
        }
        const parsed = parseClassifierOutput(text);
        return parsed;
      } finally {
        clearTimeout(timer);
      }
    }
  }
  ```

  `parseClassifierOutput(text)`: strip fences, `JSON.parse`, validate with a zod schema. Throw on any failure.

- [ ] Step 4: Add test cases: (a) happy path, (b) malformed JSON → throws, (c) abort/timeout → throws.

- [ ] Step 5: Commit:
  ```bash
  git add apps/worker/src/guardrails/classifier/ apps/worker/src/guardrails/classifier/__tests__/
  git commit -m "feat(guardrails): Haiku classifier client"
  ```

### Task 5.4: `classifierGatePolicy`

**Files:**
- Create: `apps/worker/src/guardrails/policies/classifier-gate.ts`
- Test: `__tests__/classifier-gate.test.ts`

- [ ] Step 1: Failing tests:
  - classifier returns `sensitive: false` → returns `{ allow: true, policyThatGated: 'auto_allow', reason: '...' }`.
  - classifier returns `sensitive: true` → calls `ctx.requestApproval`; returns its decision with `policyThatGated: 'classifier'`.
  - classifier throws → returns `{ allow: false, policyThatGated: 'classifier_unavailable', reason: 'classifier failed: ...' }`.

- [ ] Step 2: Fail.

- [ ] Step 3: Implement:

  ```ts
  export function makeClassifierGatePolicy(classifier: HaikuClassifier): PolicyMiddleware {
    return {
      name: 'classifier_gate',
      async check(ctx) {
        let result: ClassifierResult;
        try {
          result = await classifier.classify(ctx.toolName, ctx.toolInput);
        } catch (err) {
          return {
            allow: false,
            reason: `classifier_unavailable: ${String(err).slice(0, 200)}`,
            policyThatGated: 'classifier_unavailable',
          };
        }
        ctx.classifierReason = result.reason;
        if (!result.sensitive) {
          return { allow: true, reason: result.reason, policyThatGated: 'auto_allow' };
        }
        const { decision } = await ctx.requestApproval({
          toolName: ctx.toolName,
          toolInput: ctx.toolInput,
          classifierReason: result.reason,
          requesterUserId: ctx.requesterUserId,
          threadId: ctx.threadId,
          conversationId: ctx.conversationId,
          isOwner: ctx.isOwner,
          ownerUserId: ctx.ownerUserId,
        });
        return { ...decision, policyThatGated: 'classifier' };
      },
    };
  }
  ```

- [ ] Step 4: Tests pass.

- [ ] Step 5: Commit:
  ```bash
  git add apps/worker/src/guardrails/policies/classifier-gate.ts apps/worker/src/guardrails/policies/__tests__/
  git commit -m "feat(guardrails): classifier gate policy"
  ```

### Task 5.5: `SlackApprover`

**Files:**
- Create: `apps/worker/src/guardrails/approver/format.ts`, `apps/worker/src/guardrails/approver/slack-approver.ts`
- Test: `__tests__/slack-approver.test.ts`

- [ ] Step 1: Implement `format.ts` — two pure functions:
  - `formatOwnerThreadMessage(req): string`
  - `formatOwnerDmMessage(req, threadLink): string`

  Unit tests for both.

- [ ] Step 2: Failing test for `SlackApprover.requestApproval`:
  - Owner case → posts in same thread, calls `waitForReaction` with expectedUserId=ownerId, returns allow on 👍.
  - Worker case → calls `openDm(ownerId)`, posts in DM (with link to original thread), also posts "aguardando aprovação" in original thread, returns allow on 👍 in DM.
  - Timeout (`waitForReaction` returns null) → returns deny with policyThatGated `timeout`.
  - `waitForReaction` throws → returns deny with `approver_channel_error`.

- [ ] Step 3: Implement `SlackApprover`:

  ```ts
  export class SlackApprover {
    constructor(
      private readonly channel: Channel,
      private readonly ownerUserId: string,
      private readonly timeoutMs: number,
    ) {}

    async requestApproval(req: ApprovalRequest): Promise<ApproverResult> {
      const emojis = ['+1', '-1'];
      try {
        if (req.isOwner) {
          const target = { platform: 'slack', conversationId: req.conversationId, threadId: req.threadId };
          const text = formatOwnerThreadMessage(req);
          await this.channel.send(target, text);
          const posted = await this.channel.send(target, '...'); // placeholder: we need the ts of the msg we posted to wait on its reactions
          // See implementation note below — adapter needs to return the posted message's ts.
          // ...
        } else {
          const dmId = await this.channel.openDm(this.ownerUserId);
          // ...
        }
      } catch (err) {
        return {
          decision: { allow: false, reason: `approver_channel_error: ${String(err).slice(0, 200)}`, policyThatGated: 'approver_channel_error' },
          deciderUserId: null,
        };
      }
      // timeout path → deny with policyThatGated: 'timeout'
    }
  }
  ```

  **IMPLEMENTATION NOTE:** `Channel.send` currently returns `void`. To use `waitForReaction` on the approval message itself, `send` must return the posted message ref. Extend the interface:

  ```ts
  // in channels/types.ts
  send(target: MessageTarget, text: string): Promise<{ messageRef: string }>;
  ```

  Update `SlackChannel.send` to return `{ messageRef: result.ts ?? '' }`. Update all existing callers (AgentCore, SlackApprover, anywhere else `send` is used) — they can ignore the return.

- [ ] Step 4: Back-propagate the `send` return type change — adjust `AgentCore` (just ignore the return) and any other `send` callsite. Typecheck pass.

- [ ] Step 5: Complete `SlackApprover` implementation using the posted message's ref as the target for `waitForReaction(expectedUserId=ownerUserId)`.

- [ ] Step 6: Tests pass.

- [ ] Step 7: Commit:
  ```bash
  git add apps/worker/src/guardrails/approver/ apps/worker/src/channels/ apps/worker/src/agent/core.ts
  git commit -m "feat(guardrails): Slack approver + Channel.send returns messageRef"
  ```

### Task 5.6: `auditLog`

**Files:**
- Create: `apps/worker/src/guardrails/policies/audit.ts`
- Test: `__tests__/audit.test.ts`

- [ ] Step 1: Audit is NOT a `PolicyMiddleware` (see plan). Signature:

  ```ts
  export interface AuditLogger {
    record(ctx: PolicyContext, decision: Decision, deciderUserId: string | null): Promise<void>;
  }

  export function makeAuditLogger(repo: ApprovalsLogRepo): AuditLogger { ... }
  ```

- [ ] Step 2: Failing test: given a PolicyContext + Decision, calls `repo.insert` with the expected shape.

- [ ] Step 3: Implement — map fields and insert.

- [ ] Step 4: Tests pass.

- [ ] Step 5: Commit:
  ```bash
  git add apps/worker/src/guardrails/policies/audit.ts apps/worker/src/guardrails/policies/__tests__/
  git commit -m "feat(guardrails): audit logger"
  ```

---

## Phase 6 — Pipeline + GuardedBackend

### Task 6.1: `runPolicyPipeline`

**Files:**
- Create: `apps/worker/src/guardrails/pipeline.ts`
- Test: `__tests__/pipeline.test.ts`

- [ ] Step 1: Failing tests:
  - short-circuits at first non-`undefined` decision.
  - calls `audit.record` with the effective decision.
  - when all policies return `undefined`, emits `auto_allow` decision.

- [ ] Step 2: Implement:

  ```ts
  export async function runPolicyPipeline(
    ctx: PolicyContext,
    policies: PolicyMiddleware[],
    audit: AuditLogger,
  ): Promise<Decision> {
    let decision: Decision | undefined;
    for (const p of policies) {
      decision = await p.check(ctx);
      if (decision !== undefined) break;
    }
    const effective: Decision = decision ?? {
      allow: true,
      reason: 'no policy matched',
      policyThatGated: 'auto_allow',
    };
    // deciderUserId resolution is the approver's job — audit pulls it from a trace if present
    await audit.record(ctx, effective, null);
    return effective;
  }
  ```

  **Decider tracking:** `ctx.requestApproval` returns `{ decision, deciderUserId }` but the policy only returns `decision`. To surface `deciderUserId` to audit, attach it to `ctx` via a mutable field `ctx.lastDeciderUserId?: string | null`, set by `requestApproval`'s wrapper. Update `PolicyContext` type accordingly.

- [ ] Step 3: Tests pass.

- [ ] Step 4: Commit:
  ```bash
  git add apps/worker/src/guardrails/pipeline.ts apps/worker/src/guardrails/types.ts apps/worker/src/guardrails/__tests__/
  git commit -m "feat(guardrails): policy pipeline"
  ```

### Task 6.2: `GuardedBackend`

**Files:**
- Create: `apps/worker/src/guardrails/guarded-backend.ts`
- Test: `__tests__/guarded-backend.test.ts`

- [ ] Step 1: Failing integration-style test: mocks inner `ClaudeCodeBackend` (records the `canUseTool` it receives), mock pipeline (always allow), mock approver. Runs `query()`. Verifies inner.query was called with a `canUseTool` function and `AgentInput` passed through unchanged.

- [ ] Step 2: Implement:

  ```ts
  export class GuardedBackend implements AgentBackend {
    readonly name = 'claude-code-guarded';

    constructor(
      private readonly inner: ClaudeCodeBackend,
      private readonly deps: {
        policies: PolicyMiddleware[];
        audit: AuditLogger;
        approver: SlackApprover;
        skillRegistry: Map<string, boolean>;
        ownerUserId: string;
        profile: string;
      },
    ) {}

    async query(input: AgentInput): Promise<AgentOutput> {
      const requesterUserId = parseRequesterUserId(input.userMessage) ?? 'unknown';
      const { conversationId, threadId } = parseSlackContext(input.userMessage);
      const isOwner = requesterUserId === this.deps.ownerUserId;

      const canUseTool: CanUseTool = async (toolName, toolInput) => {
        const skillReadOnly = isToolReadOnly(this.deps.skillRegistry, toolName);
        const ctx: PolicyContext = {
          toolName, toolInput, skillReadOnly, isOwner,
          ownerUserId: this.deps.ownerUserId,
          requesterUserId, correlationId: input.correlationId,
          threadId, conversationId, profile: this.deps.profile,
          classifierReason: null,
          requestApproval: async (req) => this.deps.approver.requestApproval(req),
        };
        const decision = await runPolicyPipeline(ctx, this.deps.policies, this.deps.audit);
        if (decision.allow) return { behavior: 'allow' };
        return { behavior: 'deny', message: decision.reason };
      };

      // Rebuild inner with this canUseTool — or: construct a fresh ClaudeCodeBackend per call.
      // Simpler: pass canUseTool into constructor once and have GuardedBackend reconstruct inner per query.
      // Decision: construct once at GuardedBackend construction with a captured `canUseTool` bound to `this`.
      // See note below.
      return this.inner.query(input);
    }
  }
  ```

  **Wiring decision:** `ClaudeCodeBackend.canUseTool` is a constructor option (Task 3.1). But the callback needs per-call state (`requesterUserId`, `correlationId`). Resolution: `canUseTool` closure captures `this` (the `GuardedBackend`), and `this` maintains a **current-call slot** via `AsyncLocalStorage`. The closure reads from `AsyncLocalStorage.getStore()`, which is populated in `GuardedBackend.query` before delegating to `inner.query`.

  Add `apps/worker/src/guardrails/async-context.ts`:

  ```ts
  import { AsyncLocalStorage } from 'node:async_hooks';
  export interface CallContext {
    requesterUserId: string;
    isOwner: boolean;
    threadId: string | null;
    conversationId: string;
    correlationId: string;
  }
  export const callStorage = new AsyncLocalStorage<CallContext>();
  ```

  `GuardedBackend.query` wraps `inner.query` in `callStorage.run(...)`. Constructor builds the `canUseTool` closure once using `callStorage.getStore()`.

- [ ] Step 3: Helpers:

  ```ts
  // apps/worker/src/guardrails/slack-context.ts
  export function parseRequesterUserId(userMessage: string): string | null {
    const match = userMessage.slice(0, 500).match(/^user_id:\s*(\S+)$/m);
    return match?.[1] ?? null;
  }
  export function parseSlackContext(userMessage: string): {
    conversationId: string;
    threadId: string | null;
  } {
    const head = userMessage.slice(0, 500);
    const conv = head.match(/^conversation_id:\s*(\S+)$/m)?.[1] ?? '';
    const thr = head.match(/^thread_id:\s*(\S+)$/m)?.[1];
    return { conversationId: conv, threadId: thr === 'null' || !thr ? null : thr };
  }
  ```

  Unit tests.

- [ ] Step 4: Run full worker test suite — pass.

- [ ] Step 5: Commit:
  ```bash
  git add apps/worker/src/guardrails/
  git commit -m "feat(guardrails): GuardedBackend wrapper"
  ```

---

## Phase 7 — Boot wiring

### Task 7.1: Wire in `apps/worker/src/index.ts`

**Files:**
- Modify: `apps/worker/src/index.ts`

- [ ] Step 1: Add imports for guardrails modules.

- [ ] Step 2: After `runMigrations(db)`, instantiate `ApprovalsLogRepo`.

- [ ] Step 3: Add:

  ```ts
  const approvalsConfig = loadApprovalsConfig();
  const approvalsLogRepo = new ApprovalsLogRepo(db);
  ```

- [ ] Step 4: Refactor `buildBackend` to accept an optional `canUseTool` passed in. Actually simpler: after `buildBackend` returns the bare `ClaudeCodeBackend`, wrap it:

  ```ts
  let backend: AgentBackend = buildBackend(logger, { mcpServers, inProcessMcpServers: { zeno: cronMcp } });
  if (approvalsConfig) {
    const skillRegistry = loadSkillRegistry();
    const classifier = new HaikuClassifier({ model: approvalsConfig.classifier_model });
    const approver = new SlackApprover(slack, approvalsConfig.owner_slack_user_id, approvalsConfig.approval_timeout_sec * 1000);
    const audit = makeAuditLogger(approvalsLogRepo);
    const policies: PolicyMiddleware[] = [
      makeAlwaysSensitivePolicy(approvalsConfig.always_sensitive),
      makeReadOnlySkillPolicy(skillRegistry),
      makeClassifierGatePolicy(classifier),
    ];
    // The current `backend` is ClaudeCodeBackend; extract it and rebuild with canUseTool wired through AsyncLocalStorage.
    const guarded = new GuardedBackend(backend as ClaudeCodeBackend, {
      policies, audit, approver, skillRegistry,
      ownerUserId: approvalsConfig.owner_slack_user_id,
      profile: process.env.PROFILE ?? 'default',
    });
    backend = guarded;
    logger.info({ event: 'guardrails_enabled' }, 'guardrails enabled');
  } else {
    logger.warn({ event: 'guardrails_disabled' }, 'approvals section missing in config — running unguarded');
  }
  ```

  Watch out: `backendForRunner` (cron runner) also needs the guarded wrapper if crons should go through approvals. **Design decision:** crons run as the owner by default (cron-created in config.yaml by the owner), but their `userMessage` doesn't carry a slack_context. **Scope decision:** for MVP, crons run unguarded (same as today). Add a plan.md note and a future-work item. Wrap only the `backend` that serves user messages.

  Actually this is a policy question worth pausing on — document the decision in plan.md Risks section before implementing.

- [ ] Step 5: Typecheck + run worker test suite.

- [ ] Step 6: Commit:
  ```bash
  git add apps/worker/src/index.ts
  git commit -m "feat(worker): wire guardrails at boot when approvals config present"
  ```

### Task 7.2: Update config example

**Files:**
- Modify: `profiles/default/config.example.yaml`

- [ ] Step 1: Append documented `approvals:` section (commented out) showing every field with a short explainer.

- [ ] Step 2: Commit:
  ```bash
  git add profiles/default/config.example.yaml
  git commit -m "docs(profile): document approvals config section"
  ```

### Task 7.3: Manual smoke test

- [ ] Step 1: `pnpm run docker:build && pnpm run docker:up`.
- [ ] Step 2: Send `@Zeno read the README` → tool runs (auto_allow).
- [ ] Step 3: Verify `approvals_log` row via `sqlite3 workspace/zeno.db 'SELECT * FROM approvals_log ORDER BY id DESC LIMIT 5;'`.
- [ ] Step 4: Send `@Zeno git push --force` (or another alwaysSensitive pattern you add to `config.yaml` for the test) → approval prompt in thread, 👍 proceeds, 👎 cancels.
- [ ] Step 5: Don't react within 5min → cancellation message.
- [ ] Step 6: Temporarily set `owner_slack_user_id` to a teammate's id, send from your account → approval should route to DM of the teammate (OR test inverse: use your secondary account).
- [ ] Step 7: Capture smoke output into `tmp/0023-smoke-<date>.md` (per project convention for generated files).

---

## Phase 8 — Docs + learnings

### Task 8.1: Write learnings

- [ ] Write atomic learning notes under `context/learnings/` per the `learning.md` template. Candidates:
  - `classifier-reuses-oauth-via-sdk-query.md` — why we use `query({ allowedTools: [] })` instead of API key.
  - `async-local-storage-for-sdk-callbacks.md` — pattern for per-call state in SDK constructor-level hooks.
  - `channel-send-returns-message-ref.md` — interface change and why.
  - `guardrails-pipeline-order-matters.md` — alwaysSensitive runs before readOnlyBypass.

- [ ] Update `context/_index/learnings.md` to list new notes.

- [ ] Commit:
  ```bash
  git add context/learnings/ context/_index/learnings.md
  git commit -m "docs(learnings): guardrails implementation notes"
  ```

### Task 8.2: Mark spec shipped

- [ ] In `context/specs/2026-04-21-guardrails-approval/spec.md`, update frontmatter:
  ```yaml
  status: shipped
  shipped: 2026-MM-DD
  ```

- [ ] Open PR via `/open-pr` command.

---

## Quality gate (runs before every commit)

```bash
pnpm run quality-gate
```

Fails → fix the root cause, never skip hooks, never use `// biome-ignore` (per CLAUDE.md memory).
