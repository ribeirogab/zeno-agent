import type { HaikuClassifier } from '../classifier/haiku.js';
import type { ClassifierResult, PolicyMiddleware } from '../types.js';

/**
 * Build a policy that runs the LLM classifier on every tool call that wasn't
 * already short-circuited by deterministic gates. On `sensitive: false` the
 * tool auto-allows; on `sensitive: true` the request is forwarded to the
 * approver. Classifier failures fail-safe to deny.
 */
export function makeClassifierGatePolicy(classifier: HaikuClassifier): PolicyMiddleware {
  return {
    name: 'classifier_gate',
    async check(ctx) {
      let result: ClassifierResult;
      try {
        result = await classifier.classify(ctx.toolName, ctx.toolInput);
      } catch (error) {
        return {
          allow: false,
          reason: `classifier_unavailable: ${String(error).slice(0, 200)}`,
          policyThatGated: 'classifier_unavailable',
        };
      }

      ctx.classifierReason = result.reason;

      if (!result.sensitive) {
        return {
          allow: true,
          reason: result.reason,
          policyThatGated: 'auto_allow',
        };
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
