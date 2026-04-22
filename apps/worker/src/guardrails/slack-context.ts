/**
 * Pure parsers for the `[slack_context]` preamble that `AgentCore` prepends to
 * every Slack-originated user message (see `wrapWithSlackContext`). Used by
 * `GuardedBackend` to extract the requesting user and Slack target without
 * depending on the channel adapter.
 *
 * Both helpers only inspect the first 500 characters so a giant user message
 * cannot cause quadratic regex work.
 */

const HEAD_BYTES = 500;

export function parseRequesterUserId(userMessage: string): string | null {
  const head = userMessage.slice(0, HEAD_BYTES);
  const match = head.match(/^user_id:\s*(\S+)$/m);
  return match?.[1] ?? null;
}

export function parseSlackContext(userMessage: string): {
  conversationId: string;
  threadId: string | null;
} {
  const head = userMessage.slice(0, HEAD_BYTES);
  const conv = head.match(/^conversation_id:\s*(\S+)$/m)?.[1] ?? '';
  const thr = head.match(/^thread_id:\s*(\S+)$/m)?.[1];
  return { conversationId: conv, threadId: thr === 'null' || !thr ? null : thr };
}
