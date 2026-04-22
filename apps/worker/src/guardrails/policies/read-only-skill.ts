import type { PolicyMiddleware } from '../types.js';

/**
 * Build a policy that auto-allows tools whose owning skill declared
 * `read_only: true`. Intentionally dumb — `ctx.skillReadOnly` is computed
 * upstream by `GuardedBackend` using the registry, so the policy only reads
 * a flag.
 */
export function makeReadOnlySkillPolicy(): PolicyMiddleware {
  return {
    name: 'read_only_skill',
    async check(ctx) {
      if (!ctx.skillReadOnly) return undefined;
      return {
        allow: true,
        reason: 'skill declared read_only: true',
        policyThatGated: 'read_only',
      };
    },
  };
}
