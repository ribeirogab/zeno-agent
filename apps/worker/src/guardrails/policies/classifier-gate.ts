import type { HaikuClassifier } from '../classifier/haiku.js';
import type { ClassifierResult, PolicyMiddleware } from '../types.js';

/**
 * Build a policy that runs the LLM classifier on every tool call that wasn't
 * already short-circuited by deterministic gates. On `sensitive: false` the
 * tool auto-allows; on `sensitive: true` the request is forwarded to the
 * approver. Classifier failures fail-safe to deny.
 */
/**
 * Classifier gate is currently disabled for all users. Only the deterministic
 * `always_sensitive` gate applies. The classifier caused too many false
 * positives for routine operations (gh pr diff, gh pr review, git clone)
 * that blocked non-owner users from doing normal work like code reviews.
 *
 * Re-enable when the classifier can reliably distinguish between destructive
 * and routine operations, or when a per-skill allowlist mechanism exists.
 */
export function makeClassifierGatePolicy(_classifier: HaikuClassifier): PolicyMiddleware {
  return {
    name: 'classifier_gate',
    async check() {
      return { allow: true, reason: 'classifier disabled', policyThatGated: 'auto_allow' };
    },
  };
}
