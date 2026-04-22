import type { Channel, MessageTarget } from '@/channels/types';
import type { ApprovalRequest, ApproverResult, Decision } from '../types.js';
import { formatOwnerDmMessage, formatOwnerThreadMessage } from './format.js';

const APPROVE_EMOJI = '+1';
const DENY_EMOJI = '-1';
const REACTION_EMOJIS = [APPROVE_EMOJI, DENY_EMOJI];

/**
 * Build a Slack archive link to the thread/message that triggered the request.
 * Slack permalinks use `pTIMESTAMP` with the dot stripped from the ts.
 */
function buildThreadLink(request: ApprovalRequest): string {
  const ref = request.threadId ?? '';
  if (!ref) return `<#${request.conversationId}>`;
  const tsCompact = ref.replace('.', '');
  return `https://slack.com/archives/${request.conversationId}/p${tsCompact}`;
}

function decisionFromReaction(emoji: string): Decision {
  if (emoji === APPROVE_EMOJI) {
    return {
      allow: true,
      reason: 'approved by owner',
      // Placeholder — the calling policy overwrites this with its own slot
      // (`always_sensitive` or `classifier`). Kept as `classifier` so the type
      // stays in `PolicyThatGated` even if the overwrite is forgotten.
      policyThatGated: 'classifier',
    };
  }
  return {
    allow: false,
    reason: 'denied by owner',
    policyThatGated: 'classifier',
  };
}

/**
 * Slack-backed approver. In owner mode it posts in the same thread; in worker
 * mode it opens a DM to the owner and posts a "waiting for approval" notice in
 * the original thread so the requester knows something is happening.
 */
export class SlackApprover {
  constructor(
    private readonly channel: Channel,
    private readonly ownerUserId: string,
    private readonly timeoutMs: number,
  ) {}

  async requestApproval(request: ApprovalRequest): Promise<ApproverResult> {
    try {
      if (request.isOwner) {
        return await this.requestOwnerInThread(request);
      }
      return await this.requestOwnerInDm(request);
    } catch (error) {
      return {
        decision: {
          allow: false,
          reason: `approver_channel_error: ${String(error).slice(0, 200)}`,
          policyThatGated: 'approver_channel_error',
        },
        deciderUserId: null,
      };
    }
  }

  private async requestOwnerInThread(request: ApprovalRequest): Promise<ApproverResult> {
    const target: MessageTarget = {
      platform: 'slack',
      conversationId: request.conversationId,
      threadId: request.threadId,
    };
    const text = formatOwnerThreadMessage(request);
    const { messageRef } = await this.channel.send(target, text);
    const reactionTarget: MessageTarget = { ...target, messageRef };
    const reaction = await this.channel.waitForReaction(
      reactionTarget,
      REACTION_EMOJIS,
      this.timeoutMs,
      this.ownerUserId,
    );
    return this.resolveReaction(reaction);
  }

  private async requestOwnerInDm(request: ApprovalRequest): Promise<ApproverResult> {
    // Tell the requester something is happening — fire-and-forget; failures
    // here shouldn't block the approval flow itself.
    const requesterTarget: MessageTarget = {
      platform: 'slack',
      conversationId: request.conversationId,
      threadId: request.threadId,
    };
    await this.channel.send(requesterTarget, 'aguardando aprovação do owner...');

    const dmConversationId = await this.channel.openDm(this.ownerUserId);
    const dmTarget: MessageTarget = {
      platform: 'slack',
      conversationId: dmConversationId,
      threadId: null,
    };
    const text = formatOwnerDmMessage(request, buildThreadLink(request));
    const { messageRef } = await this.channel.send(dmTarget, text);
    const reactionTarget: MessageTarget = { ...dmTarget, messageRef };
    const reaction = await this.channel.waitForReaction(
      reactionTarget,
      REACTION_EMOJIS,
      this.timeoutMs,
      this.ownerUserId,
    );
    return this.resolveReaction(reaction);
  }

  private resolveReaction(reaction: { emoji: string; userId: string } | null): ApproverResult {
    if (reaction === null) {
      return {
        decision: {
          allow: false,
          reason: 'approval_timeout',
          policyThatGated: 'timeout',
        },
        deciderUserId: null,
      };
    }
    return {
      decision: decisionFromReaction(reaction.emoji),
      deciderUserId: reaction.userId,
    };
  }
}
