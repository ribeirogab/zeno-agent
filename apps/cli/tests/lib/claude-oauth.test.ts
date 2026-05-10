import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { runClaudeOAuth } from '../../src/lib/claude-oauth.js';

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

function makeFakeContainer(stdoutScript: Array<Buffer | string>) {
  const stream = new PassThrough();
  const exec = {
    start: vi.fn(async () => {
      queueMicrotask(() => {
        for (const c of stdoutScript) stream.write(c);
        // Don't auto-end — claude-oauth ends stdin on token capture, which
        // closes our PassThrough's writable side via the pipe. We end here
        // after a small delay to simulate the CLI exiting.
        setImmediate(() => stream.end());
      });
      return stream;
    }),
    inspect: vi.fn(async () => ({ ExitCode: 0 })),
  };
  return { container: { exec: vi.fn(async () => exec) }, stream };
}

describe('runClaudeOAuth', () => {
  it('captures token after URL prompt + code paste', async () => {
    const fc = makeFakeContainer([
      'Open https://example.com/oauth?state=xyz\n',
      'Paste code here:\n',
      `${TOKEN}\n`,
    ]);
    const promptCode = vi.fn(async () => 'AUTHCODE');
    const captured = await runClaudeOAuth({
      container: fc.container as never,
      backend: BACKEND,
      promptCode,
      mirror: null,
    });
    expect(captured).toBe(TOKEN);
    expect(promptCode).toHaveBeenCalledWith(
      'https://example.com/oauth?state=xyz',
    );
    expect(promptCode).toHaveBeenCalledTimes(1);
  });

  it('throws when the flow exits without a token', async () => {
    const fc = makeFakeContainer([
      'Open https://example.com/oauth?state=xyz\n',
      'Paste code here:\n',
      'invalid code, exiting\n',
    ]);
    await expect(
      runClaudeOAuth({
        container: fc.container as never,
        backend: BACKEND,
        promptCode: async () => 'BADCODE',
        mirror: null,
      }),
    ).rejects.toThrowError(/exited without capturing a token/);
  });
});
