import type { AuditLogger } from '@/guardrails/policies/audit';
import type { Decision, PolicyContext, PolicyMiddleware } from '@/guardrails/types';

/**
 * Run the policy chain in order. The first middleware that returns a non-
 * `undefined` `Decision` short-circuits the rest. If every middleware passes
 * through (`undefined`), the pipeline emits an `auto_allow` decision so callers
 * always get a concrete result. The audit logger is invoked exactly once per
 * call with the effective decision and the decider user id captured by the
 * `requestApproval` wrapper (see `GuardedBackend`).
 */
export async function runPolicyPipeline(
  ctx: PolicyContext,
  policies: PolicyMiddleware[],
  audit: AuditLogger,
): Promise<Decision> {
  let decision: Decision | undefined;
  for (const policy of policies) {
    decision = await policy.check(ctx);
    if (decision !== undefined) break;
  }
  const effective: Decision = decision ?? {
    allow: true,
    reason: 'no policy matched',
    policyThatGated: 'auto_allow',
  };
  await audit.record(ctx, effective, ctx.lastDeciderUserId ?? null);
  return effective;
}
