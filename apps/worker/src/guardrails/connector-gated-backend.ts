/**
 * `ConnectorGatedBackend` — wraps a `ClaudeCodeBackend` with the connector-
 * permission gate, the single guardrail surviving spec 0050. Every tool call
 * the agent attempts is intercepted by the SDK's `PreToolUse` hook (bound
 * once at construction), checked against `checkConnectorPermission`, and
 * either allowed or denied. There is no policy chain, no classifier, no
 * approval flow.
 *
 * Spec 0052: gate now consults `agentCapabilityRepo` for non-MCP tools
 * (operator opts in via /settings → Agent capabilities) instead of the
 * pre-spec-0052 hardblock. MCP tool routing logic is unchanged.
 *
 * Wiring contract: the inner `ClaudeCodeBackend` MUST be constructed with
 * `canUseTool: gated.buildPreToolUseHook()`. The hook is bound once and reads
 * the repos directly per call.
 */

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
  /** Optional logger; if set, the hook emits `skill_injected` once per (session, slug). */
  logger?: Logger;
}

export class ConnectorGatedBackend implements AgentBackend {
  readonly name = 'claude-code-connector-gated';

  /**
   * Spec 0052: per-session cache keyed by `${session_id}:${connector_slug}`
   * → true once the linked skills for that connector were injected in
   * this session. Prevents N injections when the same connector is
   * touched N times in a turn. The PreToolUseHookInput exposes
   * `session_id` (uuid per agent run) which we use as the scope.
   */
  private readonly injectedSkillsCache = new Map<string, true>();

  constructor(
    private readonly inner: ClaudeCodeBackend,
    private readonly deps: ConnectorGatedBackendDeps,
  ) {}

  async query(input: AgentInput): Promise<AgentOutput> {
    return this.inner.query(input);
  }

  private getInjectionContext(sessionKey: string, slug: string): string | null {
    const cacheKey = `${sessionKey}:${slug}`;
    if (this.injectedSkillsCache.has(cacheKey)) return null;

    const connector = this.deps.connectorRepo.getBySlug(slug);
    if (!connector) return null;
    const linked = this.deps.connectorSkillRepo.listForConnector(connector.id);
    if (linked.length === 0) return null;

    this.injectedSkillsCache.set(cacheKey, true);
    this.deps.logger?.info(
      {
        event: 'skill_injected',
        connectorSlug: slug,
        sessionId: sessionKey,
        skills: linked.map((s) => s.name),
        count: linked.length,
      },
      `injected ${linked.length} linked skill(s) for connector ${slug}`,
    );
    const bodies = linked.map((s) => `## ${s.name}\n\n${s.body}`).join('\n\n---\n\n');
    return `# Linked skills for connector \`${slug}\`\n\nThe operator has linked the following skill(s) to this connector. They describe how this operator wants tools of \`${slug}\` to be used. Read them before continuing with the tool call.\n\n${bodies}`;
  }

  /**
   * Build the `PreToolUse` hook callback for the underlying SDK. Bound once
   * at backend construction; reads the deps repos per call. Returns a
   * `permissionDecision` of `allow` or `deny` with a reason the SDK
   * propagates to the agent (and the connector_invocations error_message
   * via `extractErrorMessage`).
   */
  buildPreToolUseHook(): HookCallback {
    return async (input) => {
      const hookInput = input as PreToolUseHookInput;
      const toolName = hookInput.tool_name;
      const decision = checkConnectorPermission(
        this.deps.connectorRepo,
        this.deps.agentCapabilityRepo,
        toolName,
      );

      if (decision.allow) {
        // Spec 0052: when the allowed tool is `mcp__<slug>__*` and the
        // connector has linked skills, inject their bodies as
        // additionalContext so the agent reads the playbook before
        // executing. Cache by session_id + slug to fire only once per
        // session per connector.
        let additionalContext: string | undefined;
        const match = toolName.match(TOOL_NAME_REGEX);
        const slug = match?.[1];
        if (slug) {
          const sessionKey =
            (hookInput as PreToolUseHookInput & { session_id?: string }).session_id ??
            'unknown-session';
          additionalContext = this.getInjectionContext(sessionKey, slug) ?? undefined;
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
