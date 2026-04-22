import type { PolicyThatGated } from '@zeno/storage';

/**
 * Outcome of a single policy check or of the whole pipeline. Carries the
 * effective policy slot in `policyThatGated` so the audit row can attribute
 * the decision without extra plumbing.
 */
export type Decision =
  | { allow: true; reason: string; policyThatGated: PolicyThatGated }
  | { allow: false; reason: string; policyThatGated: PolicyThatGated };

/**
 * Information a policy hands to the approver in order to render the prompt
 * and route it correctly (in-thread vs DM).
 */
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

/**
 * What an approver returns to the policy that called it. The decider may be
 * `null` when the result was synthesised (timeout, channel error).
 */
export interface ApproverResult {
  decision: Decision;
  deciderUserId: string | null;
}

/**
 * Per-tool-call context handed to every policy. Mutable only on
 * `classifierReason` (filled by `classifierGate` so downstream audit can read
 * it). `requestApproval` is injected so policies do not depend on a concrete
 * channel implementation.
 */
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
  classifierReason: string | null;
  /**
   * Set by the `requestApproval` wrapper installed in `GuardedBackend` whenever
   * an approval was actually solicited, so the audit logger can attribute the
   * decision to a specific human. `null` when the decision was synthesised
   * (auto_allow, timeout, channel error) or no approval happened.
   */
  lastDeciderUserId?: string | null;
  requestApproval: (req: ApprovalRequest) => Promise<ApproverResult>;
}

/**
 * Single step of the policy pipeline. Returns `undefined` to pass through to
 * the next middleware, or a `Decision` to short-circuit the pipeline.
 */
export interface PolicyMiddleware {
  name: string;
  check(ctx: PolicyContext): Promise<Decision | undefined>;
}

/**
 * Output of the LLM sensitivity classifier. `reason` is propagated to the
 * approver UI and the audit row.
 */
export interface ClassifierResult {
  sensitive: boolean;
  reason: string;
}
