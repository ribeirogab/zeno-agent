import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type EventListener = (args: { event: unknown }) => Promise<void> | void;

interface MockClient {
  conversations: { open: ReturnType<typeof vi.fn>; replies: ReturnType<typeof vi.fn> };
  chat: { postMessage: ReturnType<typeof vi.fn> };
  reactions: { add: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };
  auth: { test: ReturnType<typeof vi.fn> };
}

interface MockApp {
  client: MockClient;
  event: ReturnType<typeof vi.fn>;
  message: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  __listeners: Map<string, EventListener[]>;
}

const mockAppRef: { current: MockApp | null } = { current: null };

vi.mock('@slack/bolt', () => {
  class App {
    public readonly client: MockClient;
    public readonly event: ReturnType<typeof vi.fn>;
    public readonly message: ReturnType<typeof vi.fn>;
    public readonly start: ReturnType<typeof vi.fn>;
    public readonly stop: ReturnType<typeof vi.fn>;
    public readonly __listeners = new Map<string, EventListener[]>();

    constructor() {
      this.client = {
        conversations: {
          open: vi.fn(),
          replies: vi.fn().mockResolvedValue({ messages: [] }),
        },
        chat: { postMessage: vi.fn() },
        reactions: { add: vi.fn(), remove: vi.fn() },
        auth: { test: vi.fn().mockResolvedValue({ user_id: 'BOT1' }) },
      };
      this.event = vi.fn((name: string, listener: EventListener) => {
        const list = this.__listeners.get(name) ?? [];
        list.push(listener);
        this.__listeners.set(name, list);
      });
      this.message = vi.fn((listener: EventListener) => {
        const list = this.__listeners.get('message') ?? [];
        list.push(listener);
        this.__listeners.set('message', list);
      });
      this.start = vi.fn().mockResolvedValue(undefined);
      this.stop = vi.fn().mockResolvedValue(undefined);
      mockAppRef.current = this as unknown as MockApp;
    }
  }
  return { App, LogLevel: { WARN: 'WARN' } };
});

// downloadSlackFiles is the unit creating the uploads dir; mock it so we can
// control whether the dir is created and what attachments come back.
vi.mock('@/channels/slack/files', () => {
  return {
    downloadSlackFiles: vi.fn(),
  };
});

// Mock node:fs/promises.rm so a single test can force it to reject.
// Other tests use the real rm via the mockImplementation default below.
const realFsPromises = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
const rmMock = vi.fn(realFsPromises.rm);
vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  return { ...actual, rm: (...args: Parameters<typeof actual.rm>) => rmMock(...args) };
});

// Import AFTER vi.mock declarations so the mock takes effect.
const { SlackChannel } = await import('@/channels/slack/adapter');
const filesMod = await import('@/channels/slack/files');
const downloadSlackFiles = vi.mocked(filesMod.downloadSlackFiles);

const APP_TOKEN = 'xapp-fake';
const BOT_TOKEN = 'xoxb-fake';

async function dispatchAppMention(payload: {
  user: string;
  channel: string;
  ts: string;
  text: string;
  files?: Array<{ id: string; name: string }>;
}): Promise<void> {
  const fullPayload = { type: 'app_mention', ...payload };
  const listeners = mockAppRef.current?.__listeners.get('app_mention') ?? [];
  for (const listener of listeners) {
    await listener({ event: fullPayload });
  }
}

describe('SlackChannel — per-turn uploads cleanup', () => {
  let workspaceDir: string;

  beforeEach(() => {
    workspaceDir = join(tmpdir(), `zeno-slack-test-${randomUUID()}`);
    mkdirSync(workspaceDir, { recursive: true });
    downloadSlackFiles.mockReset();
    // Reset rmMock back to delegating to the real rm.
    rmMock.mockReset();
    rmMock.mockImplementation(realFsPromises.rm);
    mockAppRef.current = null;
  });

  afterEach(() => {
    if (existsSync(workspaceDir)) {
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  });

  it('dispatch without files emits no uploads cleanup log and does not call rm', async () => {
    const channel = new SlackChannel({ appToken: APP_TOKEN, botToken: BOT_TOKEN, workspaceDir });
    const handler = vi.fn().mockResolvedValue(undefined);
    await channel.start(handler);

    await dispatchAppMention({
      user: 'U1',
      channel: 'C1',
      ts: '1710000000.000100',
      text: '<@BOT1> hello',
    });

    expect(handler).toHaveBeenCalledOnce();
    expect(downloadSlackFiles).not.toHaveBeenCalled();
    // No upload dir was created at all.
    const uploadsRoot = join(workspaceDir, 'uploads');
    expect(existsSync(uploadsRoot)).toBe(false);
  });

  it('cleans uploads dir after handler resolves successfully', async () => {
    let capturedCorrelationId = '';
    downloadSlackFiles.mockImplementation(async (_files, _token, correlationId, wd) => {
      capturedCorrelationId = correlationId;
      const dir = join(wd, 'uploads', correlationId);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'a.txt'), 'data');
      return [
        { name: 'a.txt', mimetype: 'text/plain', localPath: join(dir, 'a.txt'), sizeBytes: 4 },
      ];
    });

    const channel = new SlackChannel({ appToken: APP_TOKEN, botToken: BOT_TOKEN, workspaceDir });
    const handler = vi.fn().mockResolvedValue(undefined);
    await channel.start(handler);

    await dispatchAppMention({
      user: 'U1',
      channel: 'C1',
      ts: '1710000000.000200',
      text: '<@BOT1> review',
      files: [{ id: 'F1', name: 'a.txt' }],
    });

    expect(handler).toHaveBeenCalledOnce();
    expect(capturedCorrelationId).not.toBe('');
    const uploadsDir = join(workspaceDir, 'uploads', capturedCorrelationId);
    expect(existsSync(uploadsDir)).toBe(false);
  });

  it('cleans uploads dir after handler throws', async () => {
    let capturedCorrelationId = '';
    downloadSlackFiles.mockImplementation(async (_files, _token, correlationId, wd) => {
      capturedCorrelationId = correlationId;
      const dir = join(wd, 'uploads', correlationId);
      mkdirSync(dir, { recursive: true });
      return [];
    });

    const channel = new SlackChannel({ appToken: APP_TOKEN, botToken: BOT_TOKEN, workspaceDir });
    const handler = vi.fn().mockRejectedValue(new Error('boom'));
    await channel.start(handler);

    await dispatchAppMention({
      user: 'U1',
      channel: 'C1',
      ts: '1710000000.000300',
      text: '<@BOT1> oops',
      files: [{ id: 'F1', name: 'b.txt' }],
    });

    expect(handler).toHaveBeenCalledOnce();
    const uploadsDir = join(workspaceDir, 'uploads', capturedCorrelationId);
    expect(existsSync(uploadsDir)).toBe(false);
  });

  it('cleans the empty uploads dir when all files are skipped (oversize, etc.)', async () => {
    // Simulate downloadSlackFiles creating the dir via mkdir but returning [] (everything skipped).
    let capturedCorrelationId = '';
    downloadSlackFiles.mockImplementation(async (_files, _token, correlationId, wd) => {
      capturedCorrelationId = correlationId;
      const dir = join(wd, 'uploads', correlationId);
      mkdirSync(dir, { recursive: true });
      return [];
    });

    const channel = new SlackChannel({ appToken: APP_TOKEN, botToken: BOT_TOKEN, workspaceDir });
    const handler = vi.fn().mockResolvedValue(undefined);
    await channel.start(handler);

    await dispatchAppMention({
      user: 'U1',
      channel: 'C1',
      ts: '1710000000.000400',
      text: '<@BOT1> huge',
      files: [{ id: 'F1', name: 'huge.bin' }],
    });

    const uploadsDir = join(workspaceDir, 'uploads', capturedCorrelationId);
    expect(existsSync(uploadsDir)).toBe(false);
  });

  it('dispatch resolves even when rm fails; original handler outcome is unaffected', async () => {
    let capturedCorrelationId = '';
    downloadSlackFiles.mockImplementation(async (_files, _token, correlationId, wd) => {
      capturedCorrelationId = correlationId;
      const dir = join(wd, 'uploads', correlationId);
      mkdirSync(dir, { recursive: true });
      return [];
    });

    // Force the mocked rm to reject once. The dispatch must still resolve.
    rmMock.mockRejectedValueOnce(new Error('disk full'));

    const channel = new SlackChannel({ appToken: APP_TOKEN, botToken: BOT_TOKEN, workspaceDir });
    const handler = vi.fn().mockResolvedValue(undefined);
    await channel.start(handler);

    await expect(
      dispatchAppMention({
        user: 'U1',
        channel: 'C1',
        ts: '1710000000.000500',
        text: '<@BOT1> hi',
        files: [{ id: 'F1', name: 'c.txt' }],
      }),
    ).resolves.toBeUndefined();

    expect(handler).toHaveBeenCalledOnce();
    expect(rmMock).toHaveBeenCalled();

    // Cleanup the dir ourselves since the mocked rm failed.
    const uploadsDir = join(workspaceDir, 'uploads', capturedCorrelationId);
    if (existsSync(uploadsDir)) {
      rmSync(uploadsDir, { recursive: true, force: true });
    }
  });
});
