/**
 * Spec 0050: post-cleanup guardrails are a single connector-permission gate.
 * The previous multi-policy chain (always-sensitive / always-allowed /
 * classifier-gate / audit / read-only-skill) is gone; with it went the
 * `PolicyMiddleware` / `PolicyContext` / `ApprovalRequest` interfaces.
 *
 * What remains is a single deterministic decision shape returned by
 * `checkConnectorPermission` (in `policies/connector-permission.ts`) and
 * acted on by `ConnectorGatedBackend` (in `connector-gated-backend.ts`).
 */
export interface Decision {
  allow: boolean;
  reason: string;
  /**
   * Diagnostic tag identifying which branch of the decision tree fired.
   * Useful for log inspection and audit; not part of the wire protocol.
   */
  policyThatGated:
    | 'non_mcp_deny'
    | 'builtin_mcp_allow'
    | 'connector_allow'
    | 'connector_never'
    | 'connector_ask_allow'
    | 'unknown_tool_deny';
}
