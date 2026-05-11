import { describe, expect, it, vi } from 'vitest';

// Mock node-pty BEFORE importing the module under test.
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

vi.mock('node-pty', () => {
  return {
    spawn: (...args: unknown[]) => ptySpawnMock(...args),
  };
});

import { runDockerExecPty, stripAnsi } from '../../src/lib/docker-exec-pty.js';

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

describe('stripAnsi', () => {
  it('removes CSI sequences', () => {
    expect(stripAnsi('\x1b[32mhello\x1b[0m')).toBe('hello');
  });
  it('passes plain text through unchanged', () => {
    expect(stripAnsi('plain')).toBe('plain');
  });
});

describe('runDockerExecPty', () => {
  it('spawns docker exec with the right argv and matches a regex on streamed stdout', async () => {
    const fp = makeFakePty();
    ptySpawnMock.mockReturnValueOnce(fp);
    const onUrl = vi.fn();
    const promise = runDockerExecPty({
      containerName: 'zeno-test-0072',
      cmd: ['claude', 'setup-token'],
      matchers: [
        {
          name: 'url',
          regex: /https:\/\/example\.com\/oauth\?state=([a-z]+)/,
          onMatch: onUrl,
        },
      ],
      mirror: null,
    });
    // Verify argv
    expect(ptySpawnMock).toHaveBeenCalledWith(
      'docker',
      ['exec', '-i', '-t', 'zeno-test-0072', 'claude', 'setup-token'],
      expect.objectContaining({ cols: 200 }),
    );
    // Stream a chunk that matches the URL regex
    fp.__emitData('Open: \x1b[32mhttps://example.com/oauth?state=xyz\x1b[0m\n');
    fp.__exit(0);
    const result = await promise;
    expect(onUrl).toHaveBeenCalledWith('xyz');
    expect(result.exitCode).toBe(0);
  });

  it('forwards bytes via the onReady write callback into the spawned PTY', async () => {
    const fp = makeFakePty();
    ptySpawnMock.mockReturnValueOnce(fp);
    const promise = runDockerExecPty({
      containerName: 'zeno-test-0072',
      cmd: ['claude', 'setup-token'],
      matchers: [],
      onReady: (write) => {
        write('hello\r');
      },
      mirror: null,
    });
    fp.__exit(0);
    await promise;
    expect(fp.write).toHaveBeenCalledWith('hello\r');
  });

  it('fires each matcher at most once', async () => {
    const fp = makeFakePty();
    ptySpawnMock.mockReturnValueOnce(fp);
    const onUrl = vi.fn();
    const promise = runDockerExecPty({
      containerName: 'zeno-test-0072',
      cmd: ['x'],
      matchers: [{ name: 'url', regex: /url=(\S+)/, onMatch: onUrl }],
      mirror: null,
    });
    fp.__emitData('url=https://e.com/x\n');
    fp.__emitData('url=https://e.com/x\n');
    fp.__exit(0);
    await promise;
    expect(onUrl).toHaveBeenCalledTimes(1);
  });
});
