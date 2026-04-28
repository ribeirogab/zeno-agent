/**
 * `ConnectorGatedBackend` — wraps a `ClaudeCodeBackend` with the connector-
 * permission gate, the single guardrail surviving spec 0050. Every tool call
 * the agent attempts is intercepted by the SDK's `PreToolUse` hook (bound
 * once at construction), checked against `checkConnectorPermission`, and
 * either allowed or denied. There is no policy chain, no classifier, no
 * approval flow.
 *
 * Wiring contract: the inner `ClaudeCodeBackend` MUST be constructed with
 * `canUseTool: gated.buildPreToolUseHook()`. The hook is bound once and reads
 * `connectorRepo` directly per call.
 */

import type { HookCallback, PreToolUseHookInput } from '@anthropic-ai/claude-agent-sdk';
import type { ConnectorRepo } from '@zeno/storage';
import type { ClaudeCodeBackend } from '@/agent/backends/claude-code';
import type { AgentBackend, AgentInput, AgentOutput } from '@/agent/types';
import { checkConnectorPermission } from '@/guardrails/policies/connector-permission';

export interface ConnectorGatedBackendDeps {
  connectorRepo: ConnectorRepo;
}

export class ConnectorGatedBackend implements AgentBackend {
  readonly name = 'claude-code-connector-gated';

  constructor(
    private readonly inner: ClaudeCodeBackend,
    private readonly deps: ConnectorGatedBackendDeps,
  ) {}

  async query(input: AgentInput): Promise<AgentOutput> {
    return this.inner.query(input);
  }

  /**
   * Build the `PreToolUse` hook callback for the underlying SDK. Bound once
   * at backend construction; reads `connectorRepo` per call. Returns a
   * `permissionDecision` of `allow` or `deny` with a reason the SDK
   * propagates to the agent (and the connector_invocations error_message
   * via `extractErrorMessage`).
   */
  buildPreToolUseHook(): HookCallback {
    return async (input) => {
      const hookInput = input as PreToolUseHookInput;
      const toolName = hookInput.tool_name;
      const decision = checkConnectorPermission(this.deps.connectorRepo, toolName);

      if (decision.allow) {
        return {
          continue: true,
          hookSpecificOutput: {
            hookEventName: 'PreToolUse' as const,
            permissionDecision: 'allow' as const,
            permissionDecisionReason: decision.reason,
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
