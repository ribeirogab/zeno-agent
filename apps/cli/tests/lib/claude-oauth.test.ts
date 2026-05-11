import { describe, expect, it, vi } from 'vitest';

type DataHandler = (chunk: string) => void;
type ExitHandler = (e: { exitCode: number; signal?: number }) => void;

interface FakePty {
  write: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
  onData: (cb: DataHandler) => void;
  onExit: (cb: ExitHandler) => void;
  __emitData: (chunk: string) => void;
  __exit: (code: number) => void;
}

const ptySpawnMock = vi.fn();

vi.mock('node-pty', () => ({
  spawn: (...args: unknown[]) => ptySpawnMock(...args),
}));

import { runClaudeOAuth } from '../../src/lib/claude-oauth.js';

function makeFakePty(): FakePty {
  let dataCb: DataHandler | null = null;
  let exitCb: ExitHandler | null = null;
  return {
    write: vi.fn(),
    kill: vi.fn(),
    onData: (cb: DataHandler) => {
      dataCb = cb;
    },
    onExit: (cb: ExitHandler) => {
      exitCb = cb;
    },
    __emitData: (chunk: string) => dataCb?.(chunk),
    __exit: (code: number) => exitCb?.({ exitCode: code }),
  };
}

const BACKEND = {
  id: 'claude-code',
  auto_flow: {
    command: ['claude', 'setup-token'],
    stdout_url_regex: '(https://example\\.com/oauth\\?state=[a-z]+)',
    stdout_token_regex: '(sk-ant-oat\\d{2}-[A-Za-z0-9_-]+)',
    stdout_awaiting_code_regex: 'Paste\\s*code\\s*here',
  },
};

const TOKEN = 'sk-ant-oat01-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

describe('runClaudeOAuth', () => {
  it('captures token after URL prompt + code paste', async () => {
    const fp = makeFakePty();
    ptySpawnMock.mockReturnValueOnce(fp);
    const promptCode = vi.fn(async () => 'AUTHCODE');
    const promise = runClaudeOAuth({
      containerName: 'zeno-test-0072',
      backend: BACKEND,
      promptCode,
      mirror: null,
    });
    fp.__emitData('Open https://example.com/oauth?state=xyz\n');
    fp.__emitData('Paste code here:\n');
    // Allow promptCode + chunked writes (5ms per char) to finish.
    await new Promise((r) => setTimeout(r, 200));
    fp.__emitData(`${TOKEN}\n`);
    fp.__exit(0);
    const captured = await promise;
    expect(captured).toBe(TOKEN);
    expect(promptCode).toHaveBeenCalledWith('https://example.com/oauth?state=xyz');
    expect(promptCode).toHaveBeenCalledTimes(1);
    // chunked write — one char at a time then trailing CR
    expect(fp.write).toHaveBeenCalledWith('A');
    expect(fp.write).toHaveBeenCalledWith('\r');
  });

  it('throws when the flow exits without a token', async () => {
    const fp = makeFakePty();
    ptySpawnMock.mockReturnValueOnce(fp);
    const promise = runClaudeOAuth({
      containerName: 'zeno-test-0072',
      backend: BACKEND,
      promptCode: async () => 'BADCODE',
      mirror: null,
    });
    fp.__emitData('Open https://example.com/oauth?state=xyz\n');
    fp.__emitData('Paste code here:\n');
    await new Promise((r) => setTimeout(r, 10));
    fp.__emitData('invalid code, exiting\n');
    fp.__exit(1);
    await expect(promise).rejects.toThrowError(/exited without capturing a token/);
  });
});
