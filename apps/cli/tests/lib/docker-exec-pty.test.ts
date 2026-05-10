import { PassThrough, Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { runDockerExecPty, stripAnsi } from '../../src/lib/docker-exec-pty.js';

function makeFakeContainer(
  stdoutChunks: Array<Buffer | string>,
  opts: { exitCode?: number; endAfterChunks?: boolean } = {},
) {
  const stream = new PassThrough();
  const exec = {
    start: vi.fn(async () => {
      // Push chunks asynchronously so listeners attach first.
      queueMicrotask(() => {
        for (const c of stdoutChunks) stream.write(c);
        if (opts.endAfterChunks !== false) stream.end();
      });
      return stream;
    }),
    inspect: vi.fn(async () => ({ ExitCode: opts.exitCode ?? 0 })),
  };
  return {
    container: { exec: vi.fn(async () => exec) },
    exec,
    stream,
  };
}

describe('stripAnsi', () => {
  it('removes CSI sequences', () => {
    expect(stripAnsi('\x1b[32mhello\x1b[0m')).toBe('hello');
  });
  it('passes plain text through unchanged', () => {
    expect(stripAnsi('plain')).toBe('plain');
  });
});

describe('runDockerExecPty', () => {
  it('matches a regex against the ANSI-stripped streamed stdout', async () => {
    const fc = makeFakeContainer([
      'Open: \x1b[32mhttps://example.com/oauth?state=xyz\x1b[0m\n',
    ]);
    const onUrl = vi.fn();
    const result = await runDockerExecPty({
      container: fc.container as never,
      cmd: ['claude', 'setup-token'],
      matchers: [
        {
          name: 'url',
          regex: /https:\/\/example\.com\/oauth\?state=([a-z]+)/,
          onMatch: onUrl,
        },
      ],
      stdin: Readable.from([]),
      mirror: null,
    });
    expect(onUrl).toHaveBeenCalledWith('xyz');
    expect(result.exitCode).toBe(0);
  });

  it('forwards bytes from stdin into the exec stream', async () => {
    // Stdin chunks loop back through PassThrough as 'data' events; matcher
    // captures them. endAfterChunks=false lets stdin's pipe end the stream.
    const fc = makeFakeContainer([], { endAfterChunks: false });
    const stdin = Readable.from(['hello\r']);
    const captured: string[] = [];
    await runDockerExecPty({
      container: fc.container as never,
      cmd: ['claude', 'setup-token'],
      matchers: [
        {
          name: 'echo',
          regex: /(hello)/,
          onMatch: (v) => captured.push(v),
        },
      ],
      stdin,
      mirror: null,
    });
    expect(captured).toContain('hello');
  });

  it('fires each matcher at most once', async () => {
    const fc = makeFakeContainer(['url=https://e.com/x\n', 'url=https://e.com/x\n']);
    const onUrl = vi.fn();
    await runDockerExecPty({
      container: fc.container as never,
      cmd: ['x'],
      matchers: [{ name: 'url', regex: /url=(\S+)/, onMatch: onUrl }],
      stdin: Readable.from([]),
      mirror: null,
    });
    expect(onUrl).toHaveBeenCalledTimes(1);
  });
});
