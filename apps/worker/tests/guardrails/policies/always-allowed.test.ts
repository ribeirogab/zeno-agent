import { describe, expect, it, vi } from 'vitest';
import { makeAlwaysAllowedPolicy } from '@/guardrails/policies/always-allowed';
import type { PolicyContext } from '@/guardrails/types';

function buildCtx(toolName: string, toolInput: unknown = {}): PolicyContext {
  return {
    toolName,
    toolInput: toolInput as Record<string, unknown>,
    skillReadOnly: false,
    isOwner: false,
    ownerUserId: 'U_OWNER',
    requesterUserId: 'U_OTHER',
    correlationId: 'cid',
    threadId: null,
    conversationId: 'C',
    profile: 'default',
    classifierReason: null,
    requestApproval: vi.fn(),
  };
}

describe('alwaysAllowedPolicy', () => {
  it('allows tools in always_allowed_tools list', async () => {
    const policy = makeAlwaysAllowedPolicy({ tools: ['Read', 'Glob', 'Grep'], commands: [] });
    expect(await policy.check(buildCtx('Read', { file_path: '/foo' }))).toMatchObject({ allow: true });
    expect(await policy.check(buildCtx('Glob', { pattern: '**' }))).toMatchObject({ allow: true });
    expect(await policy.check(buildCtx('Grep', { query: 'x' }))).toMatchObject({ allow: true });
  });

  it('passes through for tools not in the list', async () => {
    const policy = makeAlwaysAllowedPolicy({ tools: ['Read'], commands: [] });
    expect(await policy.check(buildCtx('Write', { file_path: '/foo' }))).toBeUndefined();
    expect(await policy.check(buildCtx('Bash', { command: 'rm -rf /' }))).toBeUndefined();
  });

  it('allows Bash commands matching always_allowed_commands patterns', async () => {
    const policy = makeAlwaysAllowedPolicy({ tools: [], commands: ['gh pr *', 'gh api *'] });
    expect(await policy.check(buildCtx('Bash', { command: 'gh pr diff 123' }))).toMatchObject({ allow: true });
    expect(await policy.check(buildCtx('Bash', { command: 'gh pr view 42 --json title' }))).toMatchObject({ allow: true });
    expect(await policy.check(buildCtx('Bash', { command: 'gh pr review 42 --approve' }))).toMatchObject({ allow: true });
    expect(await policy.check(buildCtx('Bash', { command: 'gh api repos/foo/bar/pulls/1/reviews' }))).toMatchObject({ allow: true });
  });

  it('allows compound Bash commands with export prefix', async () => {
    const policy = makeAlwaysAllowedPolicy({ tools: [], commands: ['gh pr *', 'gh api *'] });
    expect(
      await policy.check(buildCtx('Bash', { command: 'export GH_TOKEN=$ACME_GH_TOKEN && gh pr review 87 --approve --body "ok"' })),
    ).toMatchObject({ allow: true });
    expect(
      await policy.check(buildCtx('Bash', { command: 'export GH_TOKEN=$ACME_GH_TOKEN && gh pr diff 42' })),
    ).toMatchObject({ allow: true });
    expect(
      await policy.check(buildCtx('Bash', { command: 'cd /workspace && export GH_TOKEN=$X && gh api repos/foo/bar/pulls' })),
    ).toMatchObject({ allow: true });
  });

  it('allows compound commands if any allowed pattern is found (contains-match)', async () => {
    const policy = makeAlwaysAllowedPolicy({ tools: [], commands: ['gh pr *'] });
    expect(
      await policy.check(buildCtx('Bash', { command: 'export GH_TOKEN=$X && gh pr diff 1 && echo done' })),
    ).toMatchObject({ allow: true });
  });

  it('does not allow Bash commands not in always_allowed_commands', async () => {
    const policy = makeAlwaysAllowedPolicy({ tools: [], commands: ['gh pr *'] });
    expect(await policy.check(buildCtx('Bash', { command: 'rm -rf /workspace' }))).toBeUndefined();
    expect(await policy.check(buildCtx('Bash', { command: 'git push --force' }))).toBeUndefined();
  });

  it('supports wildcard suffix on tool names', async () => {
    const policy = makeAlwaysAllowedPolicy({ tools: ['mcp__notion__*'], commands: [] });
    expect(await policy.check(buildCtx('mcp__notion__read_page'))).toMatchObject({ allow: true });
    expect(await policy.check(buildCtx('mcp__github__delete_repo'))).toBeUndefined();
  });

  it('handles Bash without command field gracefully', async () => {
    const policy = makeAlwaysAllowedPolicy({ tools: [], commands: ['gh pr *'] });
    expect(await policy.check(buildCtx('Bash', { description: 'no command' }))).toBeUndefined();
  });
});
