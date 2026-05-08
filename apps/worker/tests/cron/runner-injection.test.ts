import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ConnectorRepo,
  CronConnectorRepo,
  CronRepo,
  CronRunRepo,
  CronSkillRepo,
  openRuntimeDatabase,
  type RuntimeDB,
  runRuntimeMigrations,
  type Skill,
  SkillRepo,
} from '@zeno/db/runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentBackend } from '@/agent/types';
import type { Channel, MessageHandler, MessageTarget, ReactionEvent } from '@/channels/types';
import { CronRunner } from '@/cron/runner';

class StubChannel implements Channel {
  readonly name = 'slack';
  readonly sent: Array<{ target: MessageTarget; text: string }> = [];
  start(_onMessage: MessageHandler): Promise<void> {
    return Promise.resolve();
  }
  send(target: MessageTarget, text: string): Promise<{ messageRef: string }> {
    this.sent.push({ target, text });
    return Promise.resolve({ messageRef: 'stub' });
  }
  react(): Promise<void> {
    return Promise.resolve();
  }
  unreact(): Promise<void> {
    return Promise.resolve();
  }
  waitForReaction(): Promise<ReactionEvent | null> {
    return Promise.resolve(null);
  }
  openDm(): Promise<string> {
    return Promise.resolve('stub-dm');
  }
  stop(): Promise<void> {
    return Promise.resolve();
  }
}

interface CapturedQuery {
  systemPrompt: string;
  userMessage: string;
}

interface CapturedCronOpts {
  skillIds: string[];
  audit?: { runId: string; linkedSlugs: string[] };
}

interface SpyBackend extends AgentBackend {
  capturedQueries: CapturedQuery[];
  capturedCronOpts: CapturedCronOpts | null;
  runInCronContext: <T>(
    opts: { skillIds: string[]; audit?: { runId: string; linkedSlugs: string[] } },
    fn: () => Promise<T>,
  ) => Promise<T>;
}

function makeSpyBackend(): SpyBackend {
  const captured: CapturedQuery[] = [];
  let cronOpts: CapturedCronOpts | null = null;
  const backend: SpyBackend = {
    name: 'spy',
    capturedQueries: captured,
    get capturedCronOpts() {
      return cronOpts;
    },
    set capturedCronOpts(v) {
      cronOpts = v;
    },
    query: vi.fn(async (input) => {
      captured.push({ systemPrompt: input.systemPrompt, userMessage: input.userMessage });
      return { text: 'ok', toolCalls: [] };
    }),
    runInCronContext<T>(
      opts: { skillIds: string[]; audit?: { runId: string; linkedSlugs: string[] } },
      fn: () => Promise<T>,
    ): Promise<T> {
      cronOpts = { skillIds: [...opts.skillIds], ...(opts.audit ? { audit: opts.audit } : {}) };
      return fn();
    },
  } as unknown as SpyBackend;
  return backend;
}

let opened: ReturnType<typeof openRuntimeDatabase>;
let db: RuntimeDB;
let crons: CronRepo;
let cronRuns: CronRunRepo;
let cronSkills: CronSkillRepo;
let cronConnectors: CronConnectorRepo;
let skills: SkillRepo;
let connectors: ConnectorRepo;
let channel: StubChannel;
let sandbox: string;
let dashboardSkillsRoot: string;

/** Spec 0062: seed both RuntimeDB row + canonical FS file so the runner's body read works. */
function seedSkillWithBody(input: { name: string; description: string; body: string }): Skill {
  const skill = skills.create({ name: input.name, description: input.description });
  const dir = skills.canonicalPath(skill);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'SKILL.md'),
    `---\nname: ${input.name}\ndescription: ${input.description}\n---\n\n${input.body}`,
    'utf8',
  );
  return skill;
}

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'zeno-cron-runner-'));
  const agentSkillsRoot = join(sandbox, 'agent', 'skills');
  const profileSkillsRoot = join(sandbox, 'profile', 'skills');
  dashboardSkillsRoot = join(sandbox, 'workspace', 'skills');
  mkdirSync(agentSkillsRoot, { recursive: true });
  mkdirSync(profileSkillsRoot, { recursive: true });
  mkdirSync(dashboardSkillsRoot, { recursive: true });
  opened = openRuntimeDatabase(':memory:');
  db = opened.drizzle;
  runRuntimeMigrations(opened.raw);
  crons = new CronRepo(db);
  cronRuns = new CronRunRepo(db);
  cronSkills = new CronSkillRepo(db);
  cronConnectors = new CronConnectorRepo(db);
  skills = new SkillRepo(db, { agentSkillsRoot, profileSkillsRoot, dashboardSkillsRoot });
  connectors = new ConnectorRepo(db, {
    masterKey: Buffer.from('a'.repeat(64), 'hex'),
    profileId: 'test',
  });
  channel = new StubChannel();
});

afterEach(() => {
  opened.close();
  rmSync(sandbox, { recursive: true, force: true });
});

function makeRunner(backend: AgentBackend) {
  return new CronRunner({
    crons,
    cronRuns,
    cronSkills,
    cronConnectors,
    skillRepo: skills,
    backend,
    getSystemPrompt: () => 'sys',
    workspaceDir: '/tmp',
    channel,
    defaultConversationId: 'C-test',
  });
}

describe('CronRunner injection (spec 0054)', () => {
  it('zero linked skills + zero linked connectors → userMessage unchanged', async () => {
    const cron = crons.create({
      name: 'c',
      prompt: 'hello world',
      schedule: '* * * * *',
      source: 'chat',
    });
    const backend = makeSpyBackend();
    const runner = makeRunner(backend);
    await runner.runOnce(cron);
    expect(backend.capturedQueries).toHaveLength(1);
    expect(backend.capturedQueries[0]?.userMessage).toBe('hello world');
    expect(backend.capturedCronOpts).toEqual({
      skillIds: [],
      audit: { runId: expect.any(String), linkedSlugs: [] },
    });
  });

  it('linked skill is force-injected as [zeno_context] block before the prompt', async () => {
    const cron = crons.create({
      name: 'c',
      prompt: 'do it',
      schedule: '* * * * *',
      source: 'chat',
    });
    const skill = seedSkillWithBody({
      name: 'demo-flow',
      description: 'd',
      body: 'BODY-CONTENT',
    });
    cronSkills.add(cron.id, skill.id);
    const backend = makeSpyBackend();
    const runner = makeRunner(backend);
    await runner.runOnce(cron);
    const userMessage = backend.capturedQueries[0]?.userMessage ?? '';
    expect(userMessage).toContain('[zeno_context]');
    expect(userMessage).toContain('linked_skills:');
    expect(userMessage).toContain('## demo-flow');
    expect(userMessage).toContain('BODY-CONTENT');
    expect(userMessage).toMatch(/\[\/zeno_context\]\n\ndo it$/);
    expect(backend.capturedCronOpts?.skillIds).toEqual([skill.id]);
  });

  it('linked connector slug is appended to the [zeno_context] block + propagated as audit context', async () => {
    const cron = crons.create({
      name: 'c',
      prompt: 'list issues',
      schedule: '* * * * *',
      source: 'chat',
    });
    const conn = connectors.create({
      slug: 'linear',
      displayName: 'Linear',
      source: 'catalog',
      catalogId: 'linear',
      transport: 'remote',
      url: 'https://x',
      tools: [],
      secrets: [],
    });
    cronConnectors.add(cron.id, conn.id);
    const backend = makeSpyBackend();
    const runner = makeRunner(backend);
    await runner.runOnce(cron);
    const userMessage = backend.capturedQueries[0]?.userMessage ?? '';
    expect(userMessage).toContain('linked_connectors: linear');
    expect(backend.capturedCronOpts?.audit?.linkedSlugs).toEqual(['linear']);
  });

  it('skills + connectors → both surface in the block', async () => {
    const cron = crons.create({
      name: 'c',
      prompt: 'P',
      schedule: '* * * * *',
      source: 'chat',
    });
    const skill = seedSkillWithBody({ name: 's', description: 'd', body: 'B' });
    const conn = connectors.create({
      slug: 'linear',
      displayName: 'L',
      source: 'catalog',
      catalogId: 'linear',
      transport: 'remote',
      url: 'https://x',
      tools: [],
      secrets: [],
    });
    cronSkills.add(cron.id, skill.id);
    cronConnectors.add(cron.id, conn.id);
    const backend = makeSpyBackend();
    const runner = makeRunner(backend);
    await runner.runOnce(cron);
    const userMessage = backend.capturedQueries[0]?.userMessage ?? '';
    expect(userMessage).toContain('linked_skills:');
    expect(userMessage).toContain('linked_connectors: linear');
  });

  it('runner without cronSkills/cronConnectors repos passes prompt through unchanged', async () => {
    // Legacy / mock-only callers can omit the new repos.
    const cron = crons.create({
      name: 'c',
      prompt: 'just text',
      schedule: '* * * * *',
      source: 'chat',
    });
    const backend = makeSpyBackend();
    const runner = new CronRunner({
      crons,
      cronRuns,
      backend,
      getSystemPrompt: () => 'sys',
      workspaceDir: '/tmp',
      channel,
      defaultConversationId: 'C-test',
    });
    await runner.runOnce(cron);
    expect(backend.capturedQueries[0]?.userMessage).toBe('just text');
  });

  it('runner calls runInCronContext even when links are empty (so the gate has a fresh per-call ALS scope)', async () => {
    const cron = crons.create({
      name: 'c',
      prompt: 'p',
      schedule: '* * * * *',
      source: 'chat',
    });
    const backend = makeSpyBackend();
    const runner = makeRunner(backend);
    await runner.runOnce(cron);
    expect(backend.capturedCronOpts).toEqual({
      skillIds: [],
      audit: { runId: expect.any(String), linkedSlugs: [] },
    });
  });

  it('non-gated backend (without runInCronContext) is supported gracefully — falls back to plain query()', async () => {
    const cron = crons.create({
      name: 'c',
      prompt: 'p',
      schedule: '* * * * *',
      source: 'chat',
    });
    const backend: AgentBackend = {
      name: 'plain',
      query: vi.fn().mockResolvedValue({ text: 'ok', toolCalls: [] }),
    };
    const runner = makeRunner(backend);
    await expect(runner.runOnce(cron)).resolves.toBeUndefined();
    expect(backend.query).toHaveBeenCalledTimes(1);
  });
});
