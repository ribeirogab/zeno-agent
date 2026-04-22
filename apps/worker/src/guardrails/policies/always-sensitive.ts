import type { PolicyMiddleware } from '../types.js';

/**
 * Build a policy that gates any tool whose name matches one of `patterns`.
 *
 * Patterns are either literal tool names (`mcp__github__merge_pull_request`)
 * or `prefix*` wildcards (`mcp__github__*`). Anything that matches is sent
 * straight to the approver — this is the deterministic safety net that runs
 * before the LLM classifier.
 */
export function makeAlwaysSensitivePolicy(patterns: string[]): PolicyMiddleware {
  return {
    name: 'always_sensitive',
    async check(ctx) {
      if (patterns.length === 0) return undefined;
      const matched = patterns.some((pattern) =>
        pattern.endsWith('*')
          ? ctx.toolName.startsWith(pattern.slice(0, -1))
          : ctx.toolName === pattern,
      );
      if (!matched) return undefined;

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
