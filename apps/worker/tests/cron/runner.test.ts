import {
  CronRepo,
  CronRunRepo,
  openRuntimeDatabase,
  type RuntimeDB,
  runRuntimeMigrations,
} from '@zeno/db/runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentBackend } from '@/agent/types';
import type {
  Channel,
  MessageHandler,
  MessageTarget,
  OutgoingMessage,
  ReactionEvent,
} from '@/channels/types';
import { CronRunner } from '@/cron/runner';

class StubChannel implements Channel {
  readonly name = 'slack';
  readonly sent: Array<{ target: MessageTarget; message: OutgoingMessage }> = [];
  start(_onMessage: MessageHandler): Promise<void> {
    return Promise.resolve();
  }
  send(target: MessageTarget, message: OutgoingMessage): Promise<{ messageRef: string }> {
    this.sent.push({ target, message });
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

function fakeBackend(reply: string): AgentBackend {
  return {
    name: 'fake',
    query: vi.fn().mockResolvedValue({ text: reply, toolCalls: [] }),
  };
}

let opened: ReturnType<typeof openRuntimeDatabase>;
let db: RuntimeDB;
let crons: CronRepo;
let cronRuns: CronRunRepo;
let channel: StubChannel;

beforeEach(() => {
  opened = openRuntimeDatabase(':memory:');
  db = opened.drizzle;
  runRuntimeMigrations(opened.raw);
  crons = new CronRepo(db);
  cronRuns = new CronRunRepo(db);
  channel = new StubChannel();
});

describe('CronRunner.tick', () => {
  it('executes a due cron and posts to the configured channel', async () => {
    const cron = crons.create({
      name: 'one',
      prompt: 'say hi',
      schedule: '* * * * *',
      source: 'chat',
      notifyConversationId: 'C-test',
      nextRunAt: new Date('2026-04-16T10:00:00Z').toISOString(),
    });
    const backend = fakeBackend('hi from zeno');
    const runner = new CronRunner({
      crons,
      cronRuns,
      backend,
      getSystemPrompt: () => 'sys',
      workspaceDir: '/tmp',
      channel,
    });

    await runner.tick(new Date('2026-04-16T10:01:00Z'));

    expect(channel.sent).toEqual([
      {
        target: { platform: 'slack', conversationId: 'C-test', threadId: null },
        message: { text: 'hi from zeno' },
      },
    ]);
    const reloaded = crons.get(cron.id);
    expect(reloaded?.lastRunAt).not.toBeNull();
    expect(reloaded?.nextRunAt).not.toBeNull();
    const runs = cronRuns.recent(cron.id);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe('success');
  });

  it('skips disabled crons (they are filtered out by repo.due)', async () => {
    crons.create({
      name: 'paused',
      prompt: 'noop',
      schedule: '* * * * *',
      source: 'chat',
      enabled: false,
      notifyConversationId: 'C',
      nextRunAt: new Date('2026-04-16T09:00:00Z').toISOString(),
    });
    const backend = fakeBackend('x');
    const runner = new CronRunner({
      crons,
      cronRuns,
      backend,
      getSystemPrompt: () => 'sys',
      workspaceDir: '/tmp',
      channel,
    });

    await runner.tick(new Date('2026-04-16T10:00:00Z'));

    expect(channel.sent).toHaveLength(0);
    expect(backend.query).not.toHaveBeenCalled();
  });

  it('records a failed run when the backend throws', async () => {
    const cron = crons.create({
      name: 'broken',
      prompt: 'die',
      schedule: '* * * * *',
      source: 'chat',
      notifyConversationId: 'C',
      nextRunAt: new Date('2026-04-16T10:00:00Z').toISOString(),
    });
    const backend: AgentBackend = {
      name: 'fail',
      query: vi.fn().mockRejectedValue(new Error('boom')),
    };
    const runner = new CronRunner({
      crons,
      cronRuns,
      backend,
      getSystemPrompt: () => 'sys',
      workspaceDir: '/tmp',
      channel,
    });

    await runner.tick(new Date('2026-04-16T10:01:00Z'));

    const runs = cronRuns.recent(cron.id);
    expect(runs[0]?.status).toBe('failed');
    expect(runs[0]?.error).toContain('boom');
    // markRun still recomputes next_run_at so the cron eventually retries
    expect(crons.get(cron.id)?.lastRunAt).not.toBeNull();
  });

  it('falls back to defaultConversationId when cron has no notify channel', async () => {
    crons.create({
      name: 'orphan',
      prompt: 'hi',
      schedule: '* * * * *',
      source: 'chat',
      nextRunAt: new Date('2026-04-16T10:00:00Z').toISOString(),
    });
    const runner = new CronRunner({
      crons,
      cronRuns,
      backend: fakeBackend('hello'),
      getSystemPrompt: () => 'sys',
      workspaceDir: '/tmp',
      channel,
      defaultConversationId: 'C-default',
    });

    await runner.tick(new Date('2026-04-16T10:01:00Z'));

    expect(channel.sent[0]?.target.conversationId).toBe('C-default');
  });

  it('discards output (no send) when no destination is available', async () => {
    crons.create({
      name: 'orphan',
      prompt: 'hi',
      schedule: '* * * * *',
      source: 'chat',
      nextRunAt: new Date('2026-04-16T10:00:00Z').toISOString(),
    });
    const runner = new CronRunner({
      crons,
      cronRuns,
      backend: fakeBackend('hello'),
      getSystemPrompt: () => 'sys',
      workspaceDir: '/tmp',
      channel,
    });

    await runner.tick(new Date('2026-04-16T10:01:00Z'));
    expect(channel.sent).toHaveLength(0);
  });
});
