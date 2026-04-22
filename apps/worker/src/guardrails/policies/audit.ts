import type { ApprovalsLogRepo } from '@zeno/storage';
import type { Decision, PolicyContext } from '../types.js';

/**
 * Terminal step of the pipeline. Records every decision (allow or deny) to
 * the persistent audit log so dashboards and post-incident reviews have a
 * single source of truth.
 *
 * Not a `PolicyMiddleware` on purpose: it always runs, takes the effective
 * `Decision` as a separate argument, and never short-circuits the pipeline.
 */
export interface AuditLogger {
  record(ctx: PolicyContext, decision: Decision, deciderUserId: string | null): Promise<void>;
}

export function makeAuditLogger(repo: ApprovalsLogRepo): AuditLogger {
  return {
    async record(ctx, decision, deciderUserId) {
      repo.insert({
        profile: ctx.profile,
        correlationId: ctx.correlationId,
        threadId: ctx.threadId,
        requesterUserId: ctx.requesterUserId,
        deciderUserId,
        toolName: ctx.toolName,
        toolInput: JSON.stringify(ctx.toolInput),
        policyThatGated: decision.policyThatGated,
        classifierReason: ctx.classifierReason,
        decision: decision.allow ? 'allow' : 'deny',
        decisionReason: decision.reason,
      });
    },
  };
}
