import { beforeEach, describe, expect, it } from 'vitest';
import type { Channel, MessageHandler, MessageTarget, ReactionEvent } from '@/channels/types';
import { SlackApprover } from '@/guardrails/approver/slack-approver';
import type { ApprovalRequest } from '@/guardrails/types';

class StubChannel implements Channel {
  readonly name = 'slack';
  readonly sent: Array<{ target: MessageTarget; text: string }> = [];
  readonly openDmCalls: string[] = [];
  sendCounter = 0;
  reactionResults: Array<ReactionEvent | null> = [];
  reactionTargets: MessageTarget[] = [];
  reactionExpectedUsers: Array<string | undefined> = [];
  openDmReturn = 'D_OWNER';
  throwOnWait = false;

  start(_onMessage: MessageHandler): Promise<void> {
    return Promise.resolve();
  }
  send(target: MessageTarget, text: string): Promise<{ messageRef: string }> {
    this.sendCounter += 1;
    this.sent.push({ target, text });
    return Promise.resolve({ messageRef: `ts-${this.sendCounter}` });
  }
  react(): Promise<void> {
    return Promise.resolve();
  }
  unreact(): Promise<void> {
    return Promise.resolve();
  }
  waitForReaction(
    target: MessageTarget,
    _emojis: string[],
    _timeoutMs: number,
    expectedUserId?: string,
  ): Promise<ReactionEvent | null> {
    this.reactionTargets.push(target);
    this.reactionExpectedUsers.push(expectedUserId);
    if (this.throwOnWait) {
      return Promise.reject(new Error('socket closed'));
    }
    const next = this.reactionResults.shift();
    return Promise.resolve(next ?? null);
  }
  openDm(userId: string): Promise<string> {
    this.openDmCalls.push(userId);
    return Promise.resolve(this.openDmReturn);
  }
  stop(): Promise<void> {
    return Promise.resolve();
  }
}

let channel: StubChannel;

beforeEach(() => {
  channel = new StubChannel();
});

const baseRequest: ApprovalRequest = {
  toolName: 'Bash',
  toolInput: { command: './deploy.sh' },
  classifierReason: 'deploy script',
  requesterUserId: 'U_OWNER',
  threadId: '1700.000',
  conversationId: 'C_ENG',
  isOwner: true,
  ownerUserId: 'U_OWNER',
};

describe('SlackApprover (owner mode)', () => {
  it('posts in the original thread, waits on the posted message, returns allow on +1', async () => {
    channel.reactionResults = [{ emoji: '+1', userId: 'U_OWNER' }];
    const approver = new SlackApprover(channel, 'U_OWNER', 60_000);

    const result = await approver.requestApproval(baseRequest);

    expect(channel.sent).toHaveLength(1);
    expect(channel.sent[0]?.target).toEqual({
      platform: 'slack',
      conversationId: 'C_ENG',
      threadId: '1700.000',
    });
    expect(channel.reactionTargets[0]?.messageRef).toBe('ts-1');
    expect(channel.reactionExpectedUsers[0]).toBe('U_OWNER');
    expect(result).toEqual({
      decision: {
        allow: true,
        reason: 'approved by owner',
        policyThatGated: 'classifier',
      },
      deciderUserId: 'U_OWNER',
    });
  });

  it('returns deny on -1', async () => {
    channel.reactionResults = [{ emoji: '-1', userId: 'U_OWNER' }];
    const approver = new SlackApprover(channel, 'U_OWNER', 60_000);

    const result = await approver.requestApproval(baseRequest);

    expect(result.decision.allow).toBe(false);
    expect(result.decision.reason).toBe('denied by owner');
    expect(result.deciderUserId).toBe('U_OWNER');
  });

  it('returns timeout deny when waitForReaction resolves null', async () => {
    channel.reactionResults = [null];
    const approver = new SlackApprover(channel, 'U_OWNER', 60_000);

    const result = await approver.requestApproval(baseRequest);

    expect(result).toEqual({
      decision: {
        allow: false,
        reason: 'approval_timeout',
        policyThatGated: 'timeout',
      },
      deciderUserId: null,
    });
  });

  it('returns approver_channel_error when the channel throws', async () => {
    channel.throwOnWait = true;
    const approver = new SlackApprover(channel, 'U_OWNER', 60_000);

    const result = await approver.requestApproval(baseRequest);

    expect(result.decision.allow).toBe(false);
    expect(result.decision.policyThatGated).toBe('approver_channel_error');
    expect(result.decision.reason).toContain('approver_channel_error');
    expect(result.decision.reason).toContain('socket closed');
    expect(result.deciderUserId).toBeNull();
  });
});

describe('SlackApprover (worker mode)', () => {
  const workerRequest: ApprovalRequest = {
    ...baseRequest,
    requesterUserId: 'U_COLLEAGUE',
    isOwner: false,
  };

  it('opens a DM, posts in DM, posts waiting notice in original thread, waits in DM', async () => {
    channel.reactionResults = [{ emoji: '+1', userId: 'U_OWNER' }];
    const approver = new SlackApprover(channel, 'U_OWNER', 60_000);

    const result = await approver.requestApproval(workerRequest);

    expect(channel.openDmCalls).toEqual(['U_OWNER']);
    expect(channel.sent).toHaveLength(2);
    expect(channel.sent[0]?.target.conversationId).toBe('C_ENG');
    expect(channel.sent[0]?.text).toContain('aguardando aprovação');
    expect(channel.sent[1]?.target.conversationId).toBe('D_OWNER');
    expect(channel.sent[1]?.text).toContain('<@U_COLLEAGUE>');
    expect(channel.sent[1]?.text).toContain('https://slack.com/archives/C_ENG/p1700000');

    // Must have waited on the DM message, not on the thread notice
    expect(channel.reactionTargets[0]?.conversationId).toBe('D_OWNER');
    expect(channel.reactionTargets[0]?.messageRef).toBe('ts-2');
    expect(channel.reactionExpectedUsers[0]).toBe('U_OWNER');
    expect(result.decision.allow).toBe(true);
    expect(result.deciderUserId).toBe('U_OWNER');
  });
});
