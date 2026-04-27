import type { PolicyMiddleware } from '../types.js';

/**
 * Convert a glob pattern (with `*` wildcards at any position) into a regex
 * that matches the entire tool name. `escapeRegExp` runs on each non-wildcard
 * segment so user-supplied patterns can't inject regex syntax. Spec 0047.
 *
 * Examples:
 *   - 'mcp__github__merge_pull_request' → exact literal match
 *   - 'mcp__github__*' → matches all tools under github (suffix wildcard)
 *   - 'mcp__github-app-*__merge_pull_request' → matches across installations
 *   - '*delete*' → matches anything containing 'delete'
 */
const REGEX_META = /[.*+?^${}()|[\]\\]/g;
function escapeRegExp(s: string): string {
  return s.replace(REGEX_META, '\\$&');
}

export function matchGlob(pattern: string, toolName: string): boolean {
  if (!pattern.includes('*')) return pattern === toolName;
  const regex = new RegExp(`^${pattern.split('*').map(escapeRegExp).join('.*')}$`);
  return regex.test(toolName);
}

/**
 * Build a policy that gates any tool whose name matches one of the patterns.
 *
 * Spec 0047: accepts a `getRules` getter (called fresh on every check) so the
 * dashboard can mutate the rule set in DB and the worker picks it up on the
 * next agent turn without restart. Backwards-compatible overload accepts a
 * static `string[]` for callers that haven't migrated to the getter.
 */
export function makeAlwaysSensitivePolicy(
  arg: string[] | { getRules: () => string[] },
): PolicyMiddleware {
  const getRules: () => string[] = Array.isArray(arg) ? () => arg : arg.getRules;
  return {
    name: 'always_sensitive',
    async check(ctx) {
      const patterns = getRules();
      if (patterns.length === 0) return undefined;
      const matched = patterns.some((pattern) => matchGlob(pattern, ctx.toolName));
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
