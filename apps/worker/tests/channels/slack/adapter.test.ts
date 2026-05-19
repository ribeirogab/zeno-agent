import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type EventListener = (args: { event: unknown }) => Promise<void> | void;

interface MockClient {
  conversations: { open: ReturnType<typeof vi.fn>; replies: ReturnType<typeof vi.fn> };
  chat: { postMessage: ReturnType<typeof vi.fn> };
  files: { uploadV2: ReturnType<typeof vi.fn> };
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
        chat: { postMessage: vi.fn().mockResolvedValue({ ok: true, ts: '1234.5678' }) },
        files: { uploadV2: vi.fn() },
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

describe('SlackChannel.send — outbound files', () => {
  let workspaceDir: string;

  beforeEach(() => {
    workspaceDir = join(tmpdir(), `zeno-slack-send-${randomUUID()}`);
    mkdirSync(workspaceDir, { recursive: true });
    mockAppRef.current = null;
  });

  afterEach(() => {
    if (existsSync(workspaceDir)) {
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  });

  function writeFixture(name: string, body: string): string {
    const path = join(workspaceDir, name);
    writeFileSync(path, body);
    return path;
  }

  async function start(): Promise<{
    channel: InstanceType<typeof SlackChannel>;
    client: MockClient;
  }> {
    const channel = new SlackChannel({ appToken: APP_TOKEN, botToken: BOT_TOKEN, workspaceDir });
    await channel.start(vi.fn().mockResolvedValue(undefined));
    const client = mockAppRef.current?.client as MockClient;
    return { channel, client };
  }

  it('text-only routes to chat.postMessage (no uploadV2)', async () => {
    const { channel, client } = await start();
    const result = await channel.send(
      { platform: 'slack', conversationId: 'C1', threadId: 'T1' },
      { text: 'hi there' },
    );
    expect(client.chat.postMessage).toHaveBeenCalledOnce();
    expect(client.files.uploadV2).not.toHaveBeenCalled();
    expect(result.messageRef).toBe('1234.5678');
  });

  it('text + 1 attachment routes to files.uploadV2 with initial_comment + thread_ts', async () => {
    const path = writeFixture('places.json', '[{"a":1}]');
    const { channel, client } = await start();
    client.files.uploadV2.mockResolvedValue({
      ok: true,
      files: [{ ok: true, files: [{ id: 'F1' }] }],
    });

    const result = await channel.send(
      { platform: 'slack', conversationId: 'C1', threadId: 'T1' },
      {
        text: 'segue o arquivo',
        attachments: [
          { name: 'places.json', mimetype: 'application/json', localPath: path, sizeBytes: 8 },
        ],
      },
    );

    expect(client.chat.postMessage).not.toHaveBeenCalled();
    expect(client.files.uploadV2).toHaveBeenCalledOnce();
    const args = client.files.uploadV2.mock.calls[0][0];
    expect(args.channel_id).toBe('C1');
    expect(args.thread_ts).toBe('T1');
    expect(args.initial_comment).toBeTruthy();
    expect(Array.isArray(args.file_uploads)).toBe(true);
    expect(args.file_uploads).toHaveLength(1);
    expect(args.file_uploads[0].filename).toBe('places.json');
    expect(args.file_uploads[0].title).toBe('places.json');
    // messageRef is the first uploaded file's id (uploadV2 does not surface a
    // posted-message ts in its response, only file ids).
    expect(result.messageRef).toBe('F1');
  });

  it('text + 2 attachments uploads both in one files.uploadV2 call', async () => {
    const p1 = writeFixture('one.md', '# one');
    const p2 = writeFixture('two.csv', 'a,b\n');
    const { channel, client } = await start();
    client.files.uploadV2.mockResolvedValue({
      ok: true,
      files: [{ ok: true, files: [{ id: 'F1' }] }],
    });

    await channel.send(
      { platform: 'slack', conversationId: 'C1', threadId: 'T1' },
      {
        text: 't',
        attachments: [
          { name: 'one.md', mimetype: 'text/markdown', localPath: p1, sizeBytes: 5 },
          { name: 'two.csv', mimetype: 'text/csv', localPath: p2, sizeBytes: 4 },
        ],
      },
    );

    expect(client.files.uploadV2).toHaveBeenCalledOnce();
    expect(client.files.uploadV2.mock.calls[0][0].file_uploads).toHaveLength(2);
  });

  it('empty text + 1 attachment omits initial_comment', async () => {
    const path = writeFixture('only.txt', 'hello');
    const { channel, client } = await start();
    client.files.uploadV2.mockResolvedValue({
      ok: true,
      files: [{ ok: true, files: [{ id: 'F1' }] }],
    });

    await channel.send(
      { platform: 'slack', conversationId: 'C1', threadId: null },
      {
        text: '',
        attachments: [{ name: 'only.txt', mimetype: 'text/plain', localPath: path, sizeBytes: 5 }],
      },
    );

    const args = client.files.uploadV2.mock.calls[0][0];
    expect(args.initial_comment).toBeUndefined();
  });

  it('uploadV2 failure falls back to chat.postMessage with warning suffix', async () => {
    const path = writeFixture('rep.json', '{}');
    const { channel, client } = await start();
    client.files.uploadV2.mockRejectedValue(new Error('not_allowed_token_type'));

    const result = await channel.send(
      { platform: 'slack', conversationId: 'C1', threadId: 'T1' },
      {
        text: 'reply text',
        attachments: [
          { name: 'rep.json', mimetype: 'application/json', localPath: path, sizeBytes: 2 },
        ],
      },
    );

    expect(client.files.uploadV2).toHaveBeenCalledOnce();
    expect(client.chat.postMessage).toHaveBeenCalledOnce();
    const fallbackArgs = client.chat.postMessage.mock.calls[0][0];
    expect(fallbackArgs.text).toContain('reply text');
    expect(fallbackArgs.text).toContain('file upload failed');
    expect(result.messageRef).toBe('1234.5678');
  });

  it('falls back to a flat file shape when the SDK does not nest', async () => {
    // Some SDK paths return a flat shape: { ok, files: [{id, ...}] } instead of
    // the nested completeUploadExternal wrapper. Both must resolve.
    const path = writeFixture('p.json', '{}');
    const { channel, client } = await start();
    client.files.uploadV2.mockResolvedValue({
      ok: true,
      files: [{ id: 'F-FLAT' }],
    });

    const result = await channel.send(
      { platform: 'slack', conversationId: 'C1', threadId: null },
      {
        text: 'x',
        attachments: [
          { name: 'p.json', mimetype: 'application/json', localPath: path, sizeBytes: 2 },
        ],
      },
    );
    expect(result.messageRef).toBe('F-FLAT');
  });

  it('files.uploadV2 returning no file id throws "files.uploadV2 returned no file id"', async () => {
    const path = writeFixture('q.json', '{}');
    const { channel, client } = await start();
    client.files.uploadV2.mockResolvedValue({ ok: true, files: [{}] });

    await expect(
      channel.send(
        { platform: 'slack', conversationId: 'C1', threadId: null },
        {
          text: 'x',
          attachments: [
            { name: 'q.json', mimetype: 'application/json', localPath: path, sizeBytes: 2 },
          ],
        },
      ),
    ).rejects.toThrow('files.uploadV2 returned no file id');
  });
});
