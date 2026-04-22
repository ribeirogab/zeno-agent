import { describe, expect, it } from 'vitest';
import { formatOwnerDmMessage, formatOwnerThreadMessage } from '@/guardrails/approver/format';
import type { ApprovalRequest } from '@/guardrails/types';

const baseRequest: ApprovalRequest = {
  toolName: 'mcp__github__merge_pull_request',
  toolInput: { pr: 42 },
  classifierReason: null,
  requesterUserId: 'U_REQ',
  threadId: '1700.000',
  conversationId: 'C_ENG',
  isOwner: false,
  ownerUserId: 'U_OWNER',
};

describe('formatOwnerThreadMessage', () => {
  it('includes the tool name, input, and reaction hint', () => {
    const text = formatOwnerThreadMessage({ ...baseRequest, isOwner: true });
    expect(text).toContain('mcp__github__merge_pull_request');
    expect(text).toContain('"pr":42');
    expect(text).toContain('👍');
    expect(text).toContain('👎');
    expect(text).not.toContain('Motivo:');
  });

  it('shows the classifier reason when present', () => {
    const text = formatOwnerThreadMessage({
      ...baseRequest,
      classifierReason: 'mutates external state',
    });
    expect(text).toContain('mutates external state');
  });

  it('truncates very long tool_input payloads', () => {
    const big = { huge: 'x'.repeat(2000) };
    const text = formatOwnerThreadMessage({ ...baseRequest, toolInput: big });
    expect(text).toContain('truncated');
    expect(text.length).toBeLessThan(1500);
  });
});

describe('formatOwnerDmMessage', () => {
  it('mentions the requester and includes the link', () => {
    const text = formatOwnerDmMessage(baseRequest, 'https://slack.com/archives/C_ENG/p1700000');
    expect(text).toContain('<@U_REQ>');
    expect(text).toContain('https://slack.com/archives/C_ENG/p1700000');
    expect(text).toContain('mcp__github__merge_pull_request');
  });
});
