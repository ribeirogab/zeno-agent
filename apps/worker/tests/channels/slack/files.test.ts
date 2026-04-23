import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadSlackFiles, type SlackFile } from '@/channels/slack/files';

const BOT_TOKEN = 'xoxb-fake';

function makeFile(overrides: Partial<SlackFile> = {}): SlackFile {
  return {
    id: 'F001',
    name: 'screenshot.png',
    mimetype: 'image/png',
    size: 1024,
    url_private_download: 'https://files.slack.com/download/screenshot.png',
    ...overrides,
  };
}

describe('downloadSlackFiles', () => {
  let workspaceDir: string;
  const correlationId = 'corr-test-123';

  beforeEach(() => {
    workspaceDir = join(tmpdir(), `zeno-test-${randomUUID()}`);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (existsSync(workspaceDir)) {
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  });

  it('downloads files and returns attachments with correct metadata', async () => {
    const content = Buffer.from('fake-png-content');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(content, { status: 200 }));

    const files = [makeFile()];
    const result = await downloadSlackFiles(files, BOT_TOKEN, correlationId, workspaceDir);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      name: 'screenshot.png',
      mimetype: 'image/png',
      localPath: join(workspaceDir, 'uploads', correlationId, 'screenshot.png'),
      sizeBytes: content.length,
    });

    const saved = readFileSync(result[0].localPath);
    expect(saved.toString()).toBe('fake-png-content');
  });

  it('downloads multiple files', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response(Buffer.from('data'), { status: 200 })),
    );

    const files = [
      makeFile({ id: 'F001', name: 'a.png' }),
      makeFile({ id: 'F002', name: 'b.pdf', mimetype: 'application/pdf' }),
    ];
    const result = await downloadSlackFiles(files, BOT_TOKEN, correlationId, workspaceDir);

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('a.png');
    expect(result[1].name).toBe('b.pdf');
  });

  it('skips files with no download URL', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const files = [makeFile({ url_private_download: undefined, url_private: undefined })];
    const result = await downloadSlackFiles(files, BOT_TOKEN, correlationId, workspaceDir);

    expect(result).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('falls back to url_private when url_private_download is absent', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(Buffer.from('ok'), { status: 200 }));

    const files = [
      makeFile({
        url_private_download: undefined,
        url_private: 'https://files.slack.com/private/file.png',
      }),
    ];
    const result = await downloadSlackFiles(files, BOT_TOKEN, correlationId, workspaceDir);

    expect(result).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://files.slack.com/private/file.png',
      expect.objectContaining({ headers: { Authorization: `Bearer ${BOT_TOKEN}` } }),
    );
  });

  it('skips files exceeding the 50 MB limit', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const largeFile = makeFile({ size: 51 * 1024 * 1024 });
    const result = await downloadSlackFiles([largeFile], BOT_TOKEN, correlationId, workspaceDir);

    expect(result).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('skips files when fetch returns non-OK status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 403 }));

    const result = await downloadSlackFiles([makeFile()], BOT_TOKEN, correlationId, workspaceDir);
    expect(result).toHaveLength(0);
  });

  it('skips files when fetch throws and continues with remaining files', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    fetchSpy.mockRejectedValueOnce(new Error('network error'));
    fetchSpy.mockResolvedValueOnce(new Response(Buffer.from('ok'), { status: 200 }));

    const files = [
      makeFile({ id: 'F001', name: 'fail.png' }),
      makeFile({ id: 'F002', name: 'ok.png' }),
    ];
    const result = await downloadSlackFiles(files, BOT_TOKEN, correlationId, workspaceDir);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('ok.png');
  });

  it('sends the bot token as Authorization header', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(Buffer.from('ok'), { status: 200 }));

    await downloadSlackFiles([makeFile()], BOT_TOKEN, correlationId, workspaceDir);

    expect(fetchSpy).toHaveBeenCalledWith(expect.any(String), {
      headers: { Authorization: 'Bearer xoxb-fake' },
    });
  });
});
