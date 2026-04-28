/**
 * `ConnectorGatedBackend` — wraps a `ClaudeCodeBackend` with the connector-
 * permission gate, the single guardrail surviving spec 0050. Every tool call
 * the agent attempts is intercepted by the SDK's `PreToolUse` hook (bound
 * once at construction), checked against `checkConnectorPermission`, and
 * either allowed or denied. There is no policy chain, no classifier, no
 * approval flow.
 *
 * Spec 0052: gate consults `agentCapabilityRepo` for non-MCP tools (operator
 * opts in via /settings → Agent capabilities) instead of the pre-spec-0052
 * hardblock. When an MCP tool is allowed, the hook injects linked-skill
 * bodies as `additionalContext` so the agent reads the playbook before
 * executing the tool.
 *
 * Spec 0054: extends the wrapper with two cron-side concerns:
 *   - Force-inject linked skills before a cron's `query()` so they reach
 *     context regardless of whether the agent calls a tool.
 *   - Audit log `cron_used_unlinked_connector` once per `(runId, slug,
 *     toolName)` triplet when the cron uses a connector that isn't in its
 *     link list.
 *
 * Both concerns require per-call state available to the SDK's `PreToolUse`
 * hook. The hook fires inside the SDK's `query()` async iterator, which is
 * deeply nested under `inner.query(input)`. The state is carried via
 * AsyncLocalStorage (Node 18+ stable API) — each `runInCronContext(opts, fn)`
 * call sets up an ALS scope that the hook reads with `getStore()`.
 *
 * Why ALS instead of instance fields:
 *   - The cron MCP tool `cron_run_now` is fire-and-forget (`void
 *     runner.runOnce(...)` — see `cron/tools.ts`). While `tick()` is
 *     mid-execute on cron A, a chat-side `cron_run_now(B)` will run cron B
 *     concurrently on the same backend instance. Instance-field state would
 *     race; ALS scopes per call.
 *   - The skill-level `injectedSkillsCache` IS per-instance (long-lived per
 *     session, not per call). It survives across hook calls in the same
 *     session, which is the spec 0052 dedup contract.
 *
 * Wiring contract: the inner `ClaudeCodeBackend` MUST be constructed with
 * `preToolUseHook = wrapper.buildPreToolUseHook()` AFTER the wrapper is
 * built (see `apps/worker/src/index.ts` for the lazy-hook-ref pattern that
 * resolves the inner ↔ wrapper circular dep at SDK call time).
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { HookCallback, PreToolUseHookInput } from '@anthropic-ai/claude-agent-sdk';
import type { Logger } from '@zeno/logger';
import type { AgentCapabilityRepo, ConnectorRepo, ConnectorSkillRepo } from '@zeno/storage';
import type { ClaudeCodeBackend } from '@/agent/backends/claude-code';
import type { AgentBackend, AgentInput, AgentOutput } from '@/agent/types';
import { checkConnectorPermission } from '@/guardrails/policies/connector-permission';

const TOOL_NAME_REGEX = /^mcp__([a-z0-9][a-z0-9-]*)__(.+)$/;

export interface ConnectorGatedBackendDeps {
  connectorRepo: ConnectorRepo;
  /** Spec 0052: consulted for non-MCP tool calls (Read/Edit/Write/Bash/etc.). */
  agentCapabilityRepo: AgentCapabilityRepo;
  /**
   * Spec 0052: when a tool of a connector with linked skills is allowed,
   * the hook injects the linked-skill bodies as `additionalContext` so
   * the agent sees the playbook before executing the tool.
   */
  connectorSkillRepo: ConnectorSkillRepo;
  /** Optional logger; if set, the hook emits `skill_injected` and `cron_used_unlinked_connector` events. */
  logger?: Logger;
}

/** Spec 0054 cron context, carried via AsyncLocalStorage per `runInCronContext` invocation. */
interface CronCallState {
  /** Skill ids the cron runner pre-injected via [zeno_context]. The hook absorbs into `injectedSkillsCache` so the spec 0052 connector-driven injection does not duplicate them. */
  skillIds: readonly string[];
  /** Audit-log scope for the cron run: linkedSlugs (allowed without audit) + per-(slug, toolName) dedup set. */
  audit: {
    runId: string;
    linkedSlugs: ReadonlySet<string>;
    /** Mutable: dedupes audit log emissions per (slug, toolName) within this run. */
    dedup: Set<string>;
  } | null;
}

export interface CronContextOptions {
  /** Skill ids the cron runner already prepended to userMessage. */
  skillIds: string[];
  /** Optional audit context — when set, enables `cron_used_unlinked_connector` logs. */
  audit?: { runId: string; linkedSlugs: string[] };
}

export class ConnectorGatedBackend implements AgentBackend {
  readonly name = 'claude-code-connector-gated';

  /**
   * Spec 0052 + 0054: per-session skill cache. Keyed
   * `${session_id}:skill:${skillId}` → true once the skill body has been
   * injected (whether via the spec 0052 connector path or the spec 0054
   * cron pre-inject path). Both paths consult and write the same map so a
   * skill linked to BOTH a connector AND a cron is injected exactly once
   * per session.
   *
   * This map is per-INSTANCE (lifetime = wrapper instance lifetime, which
   * matches the worker process for the cron + chat backends). It is NOT
   * scoped by ALS — sessions are long-lived (multiple hook calls per
   * session) so ALS scoping would defeat dedup across calls.
   */
  private readonly injectedSkillsCache = new Map<string, true>();

  /** Spec 0054: per-call cron state, set up by `runInCronContext`. */
  private readonly cronAls = new AsyncLocalStorage<CronCallState>();

  constructor(
    private readonly inner: ClaudeCodeBackend,
    private readonly deps: ConnectorGatedBackendDeps,
  ) {}

  async query(input: AgentInput): Promise<AgentOutput> {
    return this.inner.query(input);
  }

  /**
   * Spec 0054: run `fn` (typically `() => this.query(input)`) inside an
   * AsyncLocalStorage scope that carries the cron's pre-inject + audit
   * state. The PreToolUse hook reads the state via `getStore()` and acts on
   * it — populating `injectedSkillsCache` with the pre-injected skill ids
   * and emitting `cron_used_unlinked_connector` audit logs.
   *
   * Each invocation creates a fresh ALS scope, so concurrent calls (e.g.
   * `tick()` mid-execute on cron A while chat fires `cron_run_now` for cron
   * B) do NOT race — each await chain has its own store.
   */
  runInCronContext<T>(opts: CronContextOptions, fn: () => Promise<T>): Promise<T> {
    const state: CronCallState = {
      skillIds: [...opts.skillIds],
      audit: opts.audit
        ? {
            runId: opts.audit.runId,
            linkedSlugs: new Set(opts.audit.linkedSlugs),
            dedup: new Set(),
          }
        : null,
    };
    return this.cronAls.run(state, fn);
  }

  /**
   * Build the additionalContext body for a connector tool call, filtered to
   * skills not yet in `injectedSkillsCache`. Returns null when either (a)
   * the connector has no linked skills, or (b) every linked skill is
   * already cached for this session (typical when the cron pre-injected
   * the same skill, or when the same connector fired earlier in the
   * session).
   *
   * Side effect: writes the newly-injected skill ids into the cache + emits
   * the `skill_injected` log.
   */
  private getInjectionContext(sessionKey: string, slug: string): string | null {
    const connector = this.deps.connectorRepo.getBySlug(slug);
    if (!connector) return null;
    const linked = this.deps.connectorSkillRepo.listForConnector(connector.id);
    if (linked.length === 0) return null;

    const remaining = linked.filter(
      (s) => !this.injectedSkillsCache.has(`${sessionKey}:skill:${s.id}`),
    );
    if (remaining.length === 0) return null;

    for (const s of remaining) {
      this.injectedSkillsCache.set(`${sessionKey}:skill:${s.id}`, true);
    }

    this.deps.logger?.info(
      {
        event: 'skill_injected',
        connectorSlug: slug,
        sessionId: sessionKey,
        skills: remaining.map((s) => s.name),
        count: remaining.length,
      },
      `injected ${remaining.length} linked skill(s) for connector ${slug}`,
    );
    const bodies = remaining.map((s) => `## ${s.name}\n\n${s.body}`).join('\n\n---\n\n');
    return `# Linked skills for connector \`${slug}\`\n\nThe operator has linked the following skill(s) to this connector. They describe how this operator wants tools of \`${slug}\` to be used. Read them before continuing with the tool call.\n\n${bodies}`;
  }

  /** Spec 0054: pull cron-injected skill ids from ALS into `injectedSkillsCache`. Idempotent (Map.set). */
  private absorbCronSkillsFromAls(sessionKey: string): void {
    const state = this.cronAls.getStore();
    if (!state || state.skillIds.length === 0) return;
    for (const skillId of state.skillIds) {
      this.injectedSkillsCache.set(`${sessionKey}:skill:${skillId}`, true);
    }
  }

  /** Spec 0054: emit `cron_used_unlinked_connector` once per (runId, slug, toolName) triplet. */
  private maybeEmitUnlinkedAudit(slug: string, toolName: string): void {
    const state = this.cronAls.getStore();
    if (!state?.audit) return;
    const audit = state.audit;
    if (audit.linkedSlugs.has(slug)) return;
    const dedupKey = `${slug}:${toolName}`;
    if (audit.dedup.has(dedupKey)) return;
    audit.dedup.add(dedupKey);
    this.deps.logger?.info(
      {
        event: 'cron_used_unlinked_connector',
        runId: audit.runId,
        connectorSlug: slug,
        toolName,
      },
      `cron run ${audit.runId} used unlinked connector ${slug} (tool ${toolName})`,
    );
  }

  /**
   * Build the `PreToolUse` hook callback for the underlying SDK. Bound once
   * at backend construction; reads the deps repos per call. Returns a
   * `permissionDecision` of `allow` or `deny` with a reason the SDK
   * propagates to the agent.
   */
  buildPreToolUseHook(): HookCallback {
    return async (input) => {
      const hookInput = input as PreToolUseHookInput;
      const toolName = hookInput.tool_name;
      const sessionKey =
        (hookInput as PreToolUseHookInput & { session_id?: string }).session_id ??
        'unknown-session';

      // Spec 0054: absorb cron pre-inject IDs idempotently on every call.
      // The runner populated ALS BEFORE `query()` started, but we don't see
      // the SDK-assigned `session_id` until the first hook fires. Doing this
      // every call is cheap (Map.set is O(1)) and keeps dedup correct.
      this.absorbCronSkillsFromAls(sessionKey);

      const decision = checkConnectorPermission(
        this.deps.connectorRepo,
        this.deps.agentCapabilityRepo,
        toolName,
      );

      if (decision.allow) {
        let additionalContext: string | undefined;
        const match = toolName.match(TOOL_NAME_REGEX);
        const slug = match?.[1];
        if (slug) {
          additionalContext = this.getInjectionContext(sessionKey, slug) ?? undefined;
          // Spec 0054: audit log for unlinked-connector use during a cron.
          this.maybeEmitUnlinkedAudit(slug, toolName);
        }

        return {
          continue: true,
          hookSpecificOutput: {
            hookEventName: 'PreToolUse' as const,
            permissionDecision: 'allow' as const,
            permissionDecisionReason: decision.reason,
            ...(additionalContext ? { additionalContext } : {}),
          },
        };
      }

      // Deny path. Mirror spec 0038 F#3: prefix the propagated reason with
      // `policy_denied:` so it's distinguishable from MCP errors in the
      // connector_invocations log. additionalContext gives the agent a
      // strong, unambiguous instruction not to retry or troubleshoot.
      const denyContext = `GUARDRAIL DENIAL — this is NOT a system permission error. The tool call was denied because the connector-permission gate evaluated it as not allowed. Reason: "${decision.reason}". Do NOT retry the tool, do NOT suggest adjusting permissions or hooks, do NOT troubleshoot. If the user asked for a capability you cannot perform, tell them so honestly.`;
      return {
        continue: true,
        reason: denyContext,
        hookSpecificOutput: {
          hookEventName: 'PreToolUse' as const,
          permissionDecision: 'deny' as const,
          permissionDecisionReason: `policy_denied: ${decision.reason}`,
          additionalContext: denyContext,
        },
      };
    };
  }
}
