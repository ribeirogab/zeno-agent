import {
  AgentCapabilityRepo,
  ConnectorRepo,
  ConnectorSkillRepo,
  closeDatabase,
  openDatabase,
  runMigrations,
  SkillRepo,
} from '@zeno/storage';
import { describe, expect, it, vi } from 'vitest';
import type { ClaudeCodeBackend } from '@/agent/backends/claude-code';
import { ConnectorGatedBackend } from '@/guardrails/connector-gated-backend';

/**
 * Spec 0050: ConnectorGatedBackend wraps a ClaudeCodeBackend with a single
 * gate — the connector-permission policy. The PreToolUse hook is built once
 * at construction; it reads ConnectorRepo per call.
 */
function makeRepo() {
  const db = openDatabase(':memory:');
  runMigrations(db);
  const repo = new ConnectorRepo(db);
  const caps = new AgentCapabilityRepo(db);
  const skillRepo = new SkillRepo(db);
  const skills = new ConnectorSkillRepo(db);
  return { repo, caps, skillRepo, skills, close: () => closeDatabase(db) };
}

function fakeInner(): ClaudeCodeBackend {
  return {
    name: 'claude-code',
    query: vi.fn(async () => ({ text: 'ok' })),
  } as unknown as ClaudeCodeBackend;
}

describe('ConnectorGatedBackend (spec 0050)', () => {
  it('delegates query() to the inner backend', async () => {
    const { repo, caps, skills, close } = makeRepo();
    const inner = fakeInner();
    const gated = new ConnectorGatedBackend(inner, {
      connectorRepo: repo,
      agentCapabilityRepo: caps,
      connectorSkillRepo: skills,
    });
    const out = await gated.query({
      systemPrompt: 'sys',
      userMessage: 'hi',
      correlationId: 'c1',
      sessionId: null,
    });
    expect(out).toEqual({ text: 'ok' });
    expect(inner.query).toHaveBeenCalledTimes(1);
    close();
  });

  it('PreToolUse hook ALLOWS a permitted MCP tool', async () => {
    const { repo, caps, skills, close } = makeRepo();
    repo.create({
      slug: 'echo',
      displayName: 'Echo',
      source: 'custom',
      transport: 'stdio',
      tools: [
        { toolName: 'read_x', description: null, category: 'read', permission: 'always_allow' },
      ],
      secrets: [],
    });
    const inner = fakeInner();
    const gated = new ConnectorGatedBackend(inner, {
      connectorRepo: repo,
      agentCapabilityRepo: caps,
      connectorSkillRepo: skills,
    });
    const hook = gated.buildPreToolUseHook();
    const result = await hook({ tool_name: 'mcp__echo__read_x', tool_input: {} } as never, '', {
      signal: new AbortController().signal,
    });
    expect(result?.hookSpecificOutput?.permissionDecision).toBe('allow');
    close();
  });

  it('PreToolUse hook DENIES a non-MCP tool with policy_denied prefix when capability is off', async () => {
    const { repo, caps, skills, close } = makeRepo();
    // Spec 0053 made Bash default-on. Use a still-default-off capability
    // (Task) to exercise the deny path on a non-MCP tool.
    const inner = fakeInner();
    const gated = new ConnectorGatedBackend(inner, {
      connectorRepo: repo,
      agentCapabilityRepo: caps,
      connectorSkillRepo: skills,
    });
    const hook = gated.buildPreToolUseHook();
    const result = await hook(
      { tool_name: 'Task', tool_input: { description: 'x', prompt: 'y' } } as never,
      '',
      {
        signal: new AbortController().signal,
      },
    );
    expect(result?.hookSpecificOutput?.permissionDecision).toBe('deny');
    expect(result?.hookSpecificOutput?.permissionDecisionReason).toMatch(/^policy_denied:/);
    expect(result?.hookSpecificOutput?.additionalContext).toContain('GUARDRAIL DENIAL');
    close();
  });

  it('PreToolUse hook DENIES when connector permission=never', async () => {
    const { repo, caps, skills, close } = makeRepo();
    repo.create({
      slug: 'github',
      displayName: 'GitHub',
      source: 'catalog',
      catalogId: 'github',
      transport: 'stdio',
      tools: [{ toolName: 'merge_pr', description: null, category: 'write', permission: 'never' }],
      secrets: [],
    });
    const inner = fakeInner();
    const gated = new ConnectorGatedBackend(inner, {
      connectorRepo: repo,
      agentCapabilityRepo: caps,
      connectorSkillRepo: skills,
    });
    const hook = gated.buildPreToolUseHook();
    const result = await hook({ tool_name: 'mcp__github__merge_pr', tool_input: {} } as never, '', {
      signal: new AbortController().signal,
    });
    expect(result?.hookSpecificOutput?.permissionDecision).toBe('deny');
    expect(result?.hookSpecificOutput?.permissionDecisionReason).toMatch(/permission=never/);
    close();
  });

  // Spec 0052 phase B.3
  it('PreToolUse hook injects linked-skill bodies when ALLOWED tool is from a connector with linked skills', async () => {
    const { repo, caps, skillRepo, skills, close } = makeRepo();
    const connector = repo.create({
      slug: 'sentry',
      displayName: 'Sentry',
      source: 'catalog',
      catalogId: 'sentry',
      transport: 'remote',
      tools: [
        {
          toolName: 'list_issues',
          description: null,
          category: 'read',
          permission: 'always_allow',
        },
      ],
      secrets: [],
      url: 'https://x',
    });
    const skill = skillRepo.create({
      name: 'sentry-flow',
      description: 'How Flávia triages Sentry issues',
      body: '# Sentry triage\n\n1. filter by env=prod\n2. group by release',
    });
    skills.add(connector.id, skill.id);

    const inner = fakeInner();
    const gated = new ConnectorGatedBackend(inner, {
      connectorRepo: repo,
      agentCapabilityRepo: caps,
      connectorSkillRepo: skills,
    });
    const hook = gated.buildPreToolUseHook();
    const first = await hook(
      {
        tool_name: 'mcp__sentry__list_issues',
        tool_input: {},
        session_id: 'sess-1',
      } as never,
      '',
      { signal: new AbortController().signal },
    );
    expect(first?.hookSpecificOutput?.permissionDecision).toBe('allow');
    expect(first?.hookSpecificOutput?.additionalContext).toContain('Sentry triage');
    expect(first?.hookSpecificOutput?.additionalContext).toContain('sentry-flow');

    // Same session + slug → cache hit, no re-injection.
    const second = await hook(
      {
        tool_name: 'mcp__sentry__list_issues',
        tool_input: {},
        session_id: 'sess-1',
      } as never,
      '',
      { signal: new AbortController().signal },
    );
    expect(second?.hookSpecificOutput?.permissionDecision).toBe('allow');
    expect(second?.hookSpecificOutput?.additionalContext).toBeUndefined();
    close();
  });

  it('PreToolUse hook does NOT inject when the connector has no linked skills', async () => {
    const { repo, caps, skillRepo, skills, close } = makeRepo();
    repo.create({
      slug: 'echo',
      displayName: 'Echo',
      source: 'custom',
      transport: 'stdio',
      tools: [{ toolName: 'do', description: null, category: 'read', permission: 'always_allow' }],
      secrets: [],
    });
    skillRepo.create({ name: 'unrelated', description: 'd', body: 'b' }); // not linked
    const inner = fakeInner();
    const gated = new ConnectorGatedBackend(inner, {
      connectorRepo: repo,
      agentCapabilityRepo: caps,
      connectorSkillRepo: skills,
    });
    const hook = gated.buildPreToolUseHook();
    const result = await hook(
      { tool_name: 'mcp__echo__do', tool_input: {}, session_id: 's2' } as never,
      '',
      { signal: new AbortController().signal },
    );
    expect(result?.hookSpecificOutput?.permissionDecision).toBe('allow');
    expect(result?.hookSpecificOutput?.additionalContext).toBeUndefined();
    close();
  });
});

// Spec 0054: cron-side pre-inject + audit (state carried via AsyncLocalStorage).
describe('ConnectorGatedBackend (spec 0054 — cron pre-inject + audit via ALS)', () => {
  function seed() {
    const r = makeRepo();
    const connector = r.repo.create({
      slug: 'sentry',
      displayName: 'Sentry',
      source: 'catalog',
      catalogId: 'sentry',
      transport: 'remote',
      tools: [
        {
          toolName: 'list_issues',
          description: null,
          category: 'read',
          permission: 'always_allow',
        },
      ],
      secrets: [],
      url: 'https://x',
    });
    const skill = r.skillRepo.create({
      name: 'sentry-flow',
      description: 'How Flávia triages Sentry',
      body: '# Sentry triage',
    });
    r.skills.add(connector.id, skill.id);
    return { ...r, connector, skill };
  }

  it('cron pre-injected skill is marked as cached so the hook does not re-inject it', async () => {
    const { repo, caps, skill, skills, close } = seed();
    const inner = fakeInner();
    const gated = new ConnectorGatedBackend(inner, {
      connectorRepo: repo,
      agentCapabilityRepo: caps,
      connectorSkillRepo: skills,
    });
    const hook = gated.buildPreToolUseHook();
    // Run the hook inside a cron context that has pre-injected this skill.
    const result = await gated.runInCronContext({ skillIds: [skill.id] }, () =>
      hook(
        {
          tool_name: 'mcp__sentry__list_issues',
          tool_input: {},
          session_id: 'cron-sess-1',
        } as never,
        '',
        { signal: new AbortController().signal },
      ),
    );
    expect(result?.hookSpecificOutput?.permissionDecision).toBe('allow');
    // The skill was already injected by the cron — the connector-driven
    // hook must NOT inject it again.
    expect(result?.hookSpecificOutput?.additionalContext).toBeUndefined();
    close();
  });

  it('partial dedup — one cached + one fresh skill builds body for the fresh only', async () => {
    const { repo, caps, skillRepo, skills, connector, close } = seed();
    const skill2 = skillRepo.create({
      name: 'extra-skill',
      description: 'd',
      body: '# Extra body',
    });
    skills.add(connector.id, skill2.id);

    const inner = fakeInner();
    const gated = new ConnectorGatedBackend(inner, {
      connectorRepo: repo,
      agentCapabilityRepo: caps,
      connectorSkillRepo: skills,
    });
    const sentryFlow = skillRepo.list().find((s) => s.name === 'sentry-flow');
    if (!sentryFlow) throw new Error('seed missing');
    const hook = gated.buildPreToolUseHook();
    // Cron pre-injected ONLY the first skill. The connector has both linked.
    const result = await gated.runInCronContext({ skillIds: [sentryFlow.id] }, () =>
      hook(
        {
          tool_name: 'mcp__sentry__list_issues',
          tool_input: {},
          session_id: 'cron-sess-2',
        } as never,
        '',
        { signal: new AbortController().signal },
      ),
    );
    expect(result?.hookSpecificOutput?.additionalContext).toBeDefined();
    // Body should mention the fresh skill (extra-skill) but NOT sentry-flow.
    expect(result?.hookSpecificOutput?.additionalContext).toContain('extra-skill');
    expect(result?.hookSpecificOutput?.additionalContext).toContain('Extra body');
    expect(result?.hookSpecificOutput?.additionalContext).not.toContain('## sentry-flow');
    close();
  });

  it('audit context: hook emits cron_used_unlinked_connector once per (slug, tool) triplet', async () => {
    const { repo, caps, skills, close } = makeRepo();
    repo.create({
      slug: 'github',
      displayName: 'GitHub',
      source: 'catalog',
      catalogId: 'github',
      transport: 'remote',
      tools: [
        {
          toolName: 'get_pr',
          description: null,
          category: 'read',
          permission: 'always_allow',
        },
      ],
      secrets: [],
      url: 'https://x',
    });
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn(),
      child: vi.fn(() => logger),
    } as never;
    const inner = fakeInner();
    const gated = new ConnectorGatedBackend(inner, {
      connectorRepo: repo,
      agentCapabilityRepo: caps,
      connectorSkillRepo: skills,
      logger,
    });
    const hook = gated.buildPreToolUseHook();
    // Cron has linkedSlugs = ['linear']. Hook fires for github 3× — audit
    // log emits once for the (github, mcp__github__get_pr) triplet.
    await gated.runInCronContext(
      { skillIds: [], audit: { runId: 'run-X', linkedSlugs: ['linear'] } },
      async () => {
        for (let i = 0; i < 3; i++) {
          await hook(
            {
              tool_name: 'mcp__github__get_pr',
              tool_input: {},
              session_id: 'cron-sess-3',
            } as never,
            '',
            { signal: new AbortController().signal },
          );
        }
      },
    );
    const auditCalls = (
      logger as { info: { mock: { calls: unknown[][] } } }
    ).info.mock.calls.filter(
      (call) =>
        typeof call[0] === 'object' &&
        call[0] !== null &&
        (call[0] as { event?: string }).event === 'cron_used_unlinked_connector',
    );
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0]?.[0]).toMatchObject({
      event: 'cron_used_unlinked_connector',
      runId: 'run-X',
      connectorSlug: 'github',
      toolName: 'mcp__github__get_pr',
    });
    close();
  });

  it('audit context: hook does NOT emit when slug IS in linkedSlugs', async () => {
    const { repo, caps, skills, close } = makeRepo();
    repo.create({
      slug: 'github',
      displayName: 'GitHub',
      source: 'catalog',
      catalogId: 'github',
      transport: 'remote',
      tools: [
        {
          toolName: 'get_pr',
          description: null,
          category: 'read',
          permission: 'always_allow',
        },
      ],
      secrets: [],
      url: 'https://x',
    });
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn(),
      child: vi.fn(() => logger),
    } as never;
    const inner = fakeInner();
    const gated = new ConnectorGatedBackend(inner, {
      connectorRepo: repo,
      agentCapabilityRepo: caps,
      connectorSkillRepo: skills,
      logger,
    });
    const hook = gated.buildPreToolUseHook();
    await gated.runInCronContext(
      { skillIds: [], audit: { runId: 'run-Y', linkedSlugs: ['github'] } },
      () =>
        hook(
          {
            tool_name: 'mcp__github__get_pr',
            tool_input: {},
            session_id: 'cron-sess-4',
          } as never,
          '',
          { signal: new AbortController().signal },
        ),
    );
    const auditCalls = (
      logger as { info: { mock: { calls: unknown[][] } } }
    ).info.mock.calls.filter(
      (call) =>
        typeof call[0] === 'object' &&
        call[0] !== null &&
        (call[0] as { event?: string }).event === 'cron_used_unlinked_connector',
    );
    expect(auditCalls).toHaveLength(0);
    close();
  });

  it('hook outside any runInCronContext sees no cron state (pure spec 0050/0052 path)', async () => {
    const { repo, caps, skills, close } = makeRepo();
    repo.create({
      slug: 'github',
      displayName: 'GitHub',
      source: 'catalog',
      catalogId: 'github',
      transport: 'remote',
      tools: [
        {
          toolName: 'get_pr',
          description: null,
          category: 'read',
          permission: 'always_allow',
        },
      ],
      secrets: [],
      url: 'https://x',
    });
    const inner = fakeInner();
    const gated = new ConnectorGatedBackend(inner, {
      connectorRepo: repo,
      agentCapabilityRepo: caps,
      connectorSkillRepo: skills,
    });
    const hook = gated.buildPreToolUseHook();
    // No runInCronContext wrap — chat-style call.
    const result = await hook(
      {
        tool_name: 'mcp__github__get_pr',
        tool_input: {},
        session_id: 'chat-sess',
      } as never,
      '',
      { signal: new AbortController().signal },
    );
    expect(result?.hookSpecificOutput?.permissionDecision).toBe('allow');
    close();
  });

  it('cron state is per-call: nested runInCronContext does NOT leak into a sibling call', async () => {
    const { repo, caps, skill, skills, close } = seed();
    const inner = fakeInner();
    const gated = new ConnectorGatedBackend(inner, {
      connectorRepo: repo,
      agentCapabilityRepo: caps,
      connectorSkillRepo: skills,
    });
    const hook = gated.buildPreToolUseHook();
    // First call: pre-inject the skill.
    await gated.runInCronContext({ skillIds: [skill.id] }, () =>
      hook(
        {
          tool_name: 'mcp__sentry__list_issues',
          tool_input: {},
          session_id: 'sess-A',
        } as never,
        '',
        { signal: new AbortController().signal },
      ),
    );
    // Second call: no cron state. Different session, hook should inject normally.
    const result = await hook(
      {
        tool_name: 'mcp__sentry__list_issues',
        tool_input: {},
        session_id: 'sess-B',
      } as never,
      '',
      { signal: new AbortController().signal },
    );
    expect(result?.hookSpecificOutput?.additionalContext).toBeDefined();
    expect(result?.hookSpecificOutput?.additionalContext).toContain('sentry-flow');
    close();
  });

  it('concurrent runInCronContext calls do not race (ALS isolates state per await chain)', async () => {
    const { repo, caps, skillRepo, skills, close } = seed();
    const skillA = skillRepo.list().find((s) => s.name === 'sentry-flow');
    if (!skillA) throw new Error('seed missing');
    const skillB = skillRepo.create({ name: 'other', description: 'd', body: 'OTHER' });
    const connectorB = repo.create({
      slug: 'linear',
      displayName: 'Linear',
      source: 'catalog',
      catalogId: 'linear',
      transport: 'remote',
      tools: [
        {
          toolName: 'list_issues',
          description: null,
          category: 'read',
          permission: 'always_allow',
        },
      ],
      secrets: [],
      url: 'https://x',
    });
    skills.add(connectorB.id, skillB.id);

    const inner = fakeInner();
    const gated = new ConnectorGatedBackend(inner, {
      connectorRepo: repo,
      agentCapabilityRepo: caps,
      connectorSkillRepo: skills,
    });
    const hook = gated.buildPreToolUseHook();
    // Two concurrent cron contexts. Each pre-injects a different skill.
    // Each hook call should only see its own context's state.
    const [resA, resB] = await Promise.all([
      gated.runInCronContext({ skillIds: [skillA.id] }, async () => {
        // Wait a bit so the two contexts overlap in real time.
        await new Promise((r) => setTimeout(r, 0));
        return hook(
          {
            tool_name: 'mcp__sentry__list_issues',
            tool_input: {},
            session_id: 'concurrent-A',
          } as never,
          '',
          { signal: new AbortController().signal },
        );
      }),
      gated.runInCronContext({ skillIds: [skillB.id] }, async () => {
        await new Promise((r) => setTimeout(r, 0));
        return hook(
          {
            tool_name: 'mcp__linear__list_issues',
            tool_input: {},
            session_id: 'concurrent-B',
          } as never,
          '',
          { signal: new AbortController().signal },
        );
      }),
    ]);
    // Each session should NOT receive its pre-injected skill back from the
    // hook (already cached). Both `additionalContext` should be undefined.
    expect(resA?.hookSpecificOutput?.additionalContext).toBeUndefined();
    expect(resB?.hookSpecificOutput?.additionalContext).toBeUndefined();
    close();
  });
});
