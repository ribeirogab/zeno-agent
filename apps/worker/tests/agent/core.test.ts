import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mkdirMock = vi.fn();
const rmMock = vi.fn();

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  return {
    ...actual,
    mkdir: (...args: unknown[]) => mkdirMock(...args),
    rm: (...args: unknown[]) => rmMock(...args),
  };
});

const collectOutboxMock = vi.fn();
vi.mock('@/agent/collect-outbox', () => ({
  collectOutbox: (...args: unknown[]) => collectOutboxMock(...args),
}));

const { AgentCore } = await import('@/agent/core');

interface MockChannel {
  name: string;
  send: ReturnType<typeof vi.fn>;
  react: ReturnType<typeof vi.fn>;
  unreact: ReturnType<typeof vi.fn>;
  waitForReaction: ReturnType<typeof vi.fn>;
  openDm: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}

function makeChannel(): MockChannel {
  return {
    name: 'slack',
    send: vi.fn().mockResolvedValue({ messageRef: 'ts-1' }),
    react: vi.fn().mockResolvedValue(undefined),
    unreact: vi.fn().mockResolvedValue(undefined),
    waitForReaction: vi.fn().mockResolvedValue(null),
    openDm: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
}

interface FakeMessage {
  platform: string;
  userId: string;
  conversationId: string;
  threadId: string | null;
  text: string;
  correlationId: string;
  messageRef: string;
  raw: unknown;
}

function makeMessage(overrides: Partial<FakeMessage> = {}): FakeMessage {
  return {
    platform: 'slack',
    userId: 'U1',
    conversationId: 'C1',
    threadId: 'T1',
    text: 'hello',
    correlationId: `corr-${randomUUID()}`,
    messageRef: 'ts-orig',
    raw: {},
    ...overrides,
  };
}

const sessionRepoStub = {
  get: vi.fn().mockReturnValue(null),
  upsert: vi.fn(),
  delete: vi.fn(),
};

describe('AgentCore.bind — outbox lifecycle', () => {
  beforeEach(() => {
    mkdirMock.mockReset().mockResolvedValue(undefined);
    rmMock.mockReset().mockResolvedValue(undefined);
    collectOutboxMock.mockReset().mockResolvedValue([]);
    sessionRepoStub.get.mockReset().mockReturnValue(null);
    sessionRepoStub.upsert.mockReset();
    sessionRepoStub.delete.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates outbox dir, collects after backend, passes attachments to send, cleans up', async () => {
    const channel = makeChannel();
    const message = makeMessage();
    const backend = {
      query: vi.fn().mockResolvedValue({ text: 'reply', sessionId: 'sess-1' }),
    };
    collectOutboxMock.mockResolvedValue([
      {
        name: 'places.json',
        mimetype: 'application/json',
        localPath: `/ws/outbox/${message.correlationId}/places.json`,
        sizeBytes: 12,
      },
    ]);

    const core = new AgentCore({
      backend,
      workspaceDir: '/ws',
      getSystemPrompt: () => 'sys',
      sessions: sessionRepoStub,
    } as never);
    await core.bind(channel as never)(message as never);

    expect(mkdirMock).toHaveBeenCalledWith(`/ws/outbox/${message.correlationId}`, {
      recursive: true,
    });
    expect(backend.query).toHaveBeenCalledOnce();
    expect(collectOutboxMock).toHaveBeenCalledWith(`/ws/outbox/${message.correlationId}`);
    expect(channel.send).toHaveBeenCalledWith(
      expect.objectContaining({ platform: 'slack', conversationId: 'C1' }),
      expect.objectContaining({
        text: 'reply',
        attachments: expect.arrayContaining([expect.objectContaining({ name: 'places.json' })]),
      }),
    );
    expect(rmMock).toHaveBeenCalledWith(`/ws/outbox/${message.correlationId}`, {
      recursive: true,
      force: true,
    });
  });

  it('omits attachments key when outbox is empty', async () => {
    const channel = makeChannel();
    const message = makeMessage();
    const backend = {
      query: vi.fn().mockResolvedValue({ text: 'no files', sessionId: 'sess-2' }),
    };
    collectOutboxMock.mockResolvedValue([]);

    const core = new AgentCore({
      backend,
      workspaceDir: '/ws',
      getSystemPrompt: () => 'sys',
      sessions: sessionRepoStub,
    } as never);
    await core.bind(channel as never)(message as never);

    expect(channel.send).toHaveBeenCalledOnce();
    const sendArgs = channel.send.mock.calls[0];
    const outgoing = sendArgs[1] as Record<string, unknown>;
    expect(outgoing).toEqual({ text: 'no files' });
    expect(outgoing).not.toHaveProperty('attachments');
  });

  it('cleans outbox dir after backend.query throws (reportFailure path)', async () => {
    const channel = makeChannel();
    const message = makeMessage();
    const backend = {
      query: vi.fn().mockRejectedValue(new Error('boom')),
    };

    const core = new AgentCore({
      backend,
      workspaceDir: '/ws',
      getSystemPrompt: () => 'sys',
      sessions: sessionRepoStub,
    } as never);
    await core.bind(channel as never)(message as never);

    expect(rmMock).toHaveBeenCalledWith(`/ws/outbox/${message.correlationId}`, {
      recursive: true,
      force: true,
    });
    const lastSend = channel.send.mock.calls.at(-1);
    if (lastSend) {
      const outgoing = lastSend[1] as Record<string, unknown>;
      expect(outgoing).not.toHaveProperty('attachments');
    }
  });

  it('mkdir failure proceeds without outbox surface and skips cleanup', async () => {
    mkdirMock.mockRejectedValueOnce(new Error('disk full'));
    const channel = makeChannel();
    const message = makeMessage();
    const backend = {
      query: vi.fn().mockResolvedValue({ text: 'reply', sessionId: 'sess-3' }),
    };

    const core = new AgentCore({
      backend,
      workspaceDir: '/ws',
      getSystemPrompt: () => 'sys',
      sessions: sessionRepoStub,
    } as never);
    await core.bind(channel as never)(message as never);

    expect(backend.query).toHaveBeenCalledOnce();
    expect(collectOutboxMock).not.toHaveBeenCalled();
    expect(rmMock).not.toHaveBeenCalled();
    expect(channel.send).toHaveBeenCalledOnce();
  });

  it('cleanup failure is swallowed; dispatch resolves cleanly', async () => {
    rmMock.mockRejectedValueOnce(new Error('cleanup boom'));
    const channel = makeChannel();
    const message = makeMessage();
    const backend = {
      query: vi.fn().mockResolvedValue({ text: 'reply', sessionId: 'sess-4' }),
    };

    const core = new AgentCore({
      backend,
      workspaceDir: '/ws',
      getSystemPrompt: () => 'sys',
      sessions: sessionRepoStub,
    } as never);
    await expect(core.bind(channel as never)(message as never)).resolves.toBeUndefined();
    expect(rmMock).toHaveBeenCalledOnce();
  });

  it('session-resume retry path also collects + sends attachments', async () => {
    sessionRepoStub.get.mockReturnValue('stale-session-id');
    const channel = makeChannel();
    const message = makeMessage();
    const backend = {
      query: vi
        .fn()
        .mockRejectedValueOnce(new Error('No conversation found with session ID: stale-session-id'))
        .mockResolvedValueOnce({ text: 'retry reply', sessionId: 'sess-new' }),
    };
    collectOutboxMock.mockResolvedValue([
      {
        name: 'late.json',
        mimetype: 'application/json',
        localPath: `/ws/outbox/${message.correlationId}/late.json`,
        sizeBytes: 5,
      },
    ]);

    const core = new AgentCore({
      backend,
      workspaceDir: '/ws',
      getSystemPrompt: () => 'sys',
      sessions: sessionRepoStub,
    } as never);
    await core.bind(channel as never)(message as never);

    expect(backend.query).toHaveBeenCalledTimes(2);
    expect(collectOutboxMock).toHaveBeenCalledTimes(1);
    expect(channel.send).toHaveBeenCalledOnce();
    const outgoing = channel.send.mock.calls[0][1] as Record<string, unknown>;
    expect(outgoing).toMatchObject({
      text: 'retry reply',
      attachments: expect.arrayContaining([expect.objectContaining({ name: 'late.json' })]),
    });
    expect(rmMock).toHaveBeenCalledOnce();
  });
});
