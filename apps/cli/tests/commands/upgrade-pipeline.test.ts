import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const homeRef = vi.hoisted(() => ({ value: '/__placeholder__' }));

vi.mock('@/lib/paths.js', () => ({
  get ZENO_HOME() {
    return homeRef.value;
  },
}));

const dbConn = vi.hoisted(() => ({}));
const queriesMock = vi.hoisted(() => ({
  setVersion: vi.fn(),
  getVersion: vi.fn(),
  appendAudit: vi.fn(),
}));

vi.mock('@/lib/state.js', () => ({ db: () => dbConn }));
vi.mock('@zeno/db/host', () => ({ queries: queriesMock }));

const stepsMock = vi.hoisted(() => ({
  fetchTags: vi.fn(),
  checkoutRef: vi.fn(),
  setVersion: vi.fn(),
  writeMeta: vi.fn(),
  installDeps: vi.fn(),
  buildCli: vi.fn(),
  buildImage: vi.fn(),
  shortSha: vi.fn(() => 'aaa1111'),
  listReleases: vi.fn(async () => [
    { tag: 'v2026.5.10', prerelease: false, publishedAt: '2026-05-09' },
    { tag: 'v2026.5.9', prerelease: false, publishedAt: '2026-05-08' },
  ]),
}));

vi.mock('@/lib/upgrade.js', async () => {
  const actual = await vi.importActual<typeof import('@/lib/upgrade.js')>('@/lib/upgrade.js');
  return {
    ...actual,
    listReleases: stepsMock.listReleases,
    shortSha: stepsMock.shortSha,
    upgradeSteps: {
      fetchTags: stepsMock.fetchTags,
      checkoutRef: stepsMock.checkoutRef,
      setVersion: stepsMock.setVersion,
      writeMeta: stepsMock.writeMeta,
      installDeps: stepsMock.installDeps,
      buildCli: stepsMock.buildCli,
      buildImage: stepsMock.buildImage,
    },
  };
});

vi.mock('@/lib/spinner.js', () => ({
  spin: async <T>(_label: string, fn: () => Promise<T>) => fn(),
}));

import upgrade from '@/commands/upgrade.js';
import { writeMeta } from '@/lib/version-meta.js';

let tmp: string;
let exitSpy: ReturnType<typeof vi.spyOn>;
let stdoutChunks: string[];
let stderrChunks: string[];
let logSpy: ReturnType<typeof vi.spyOn>;
let errSpy: ReturnType<typeof vi.spyOn>;
let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;
let stderrWriteSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'zeno-upgrade-'));
  homeRef.value = tmp;
  queriesMock.setVersion.mockReset();
  queriesMock.getVersion.mockReset();
  queriesMock.appendAudit.mockReset();
  stepsMock.fetchTags.mockReset();
  stepsMock.checkoutRef.mockReset();
  stepsMock.setVersion.mockReset();
  stepsMock.writeMeta.mockReset();
  stepsMock.installDeps.mockReset();
  stepsMock.buildCli.mockReset();
  stepsMock.buildImage.mockReset();
  stepsMock.shortSha.mockReturnValue('aaa1111');
  stdoutChunks = [];
  stderrChunks = [];
  exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
    throw new Error('__exit__');
  }) as never);
  logSpy = vi.spyOn(console, 'log').mockImplementation(((...args: unknown[]) => {
    stdoutChunks.push(args.map(String).join(' '));
  }) as never);
  errSpy = vi.spyOn(console, 'error').mockImplementation(((...args: unknown[]) => {
    stderrChunks.push(args.map(String).join(' '));
  }) as never);
  stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => {
    stdoutChunks.push(String(chunk));
    return true;
  }) as never);
  stderrWriteSpy = vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: unknown) => {
    stderrChunks.push(String(chunk));
    return true;
  }) as never);
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
  exitSpy.mockRestore();
  logSpy.mockRestore();
  errSpy.mockRestore();
  stdoutWriteSpy.mockRestore();
  stderrWriteSpy.mockRestore();
});

describe('zeno upgrade pipeline', () => {
  it('--dry-run prints all 7 steps without executing', async () => {
    queriesMock.getVersion.mockReturnValue('v2026.5.9');
    await upgrade.run?.({
      args: { branch: 'feat/foo', yes: true, dryRun: true },
      cmd: upgrade,
      rawArgs: [],
      data: undefined,
    } as never);
    const out = stdoutChunks.join('\n');
    expect(out).toMatch(/target.*branch:feat\/foo/);
    for (const step of [
      'fetchTags',
      'checkoutRef',
      'setVersion',
      'writeMeta',
      'installDeps',
      'buildCli',
      'buildImage',
    ]) {
      expect(out).toContain(step);
    }
    expect(stepsMock.fetchTags).not.toHaveBeenCalled();
    expect(stepsMock.buildImage).not.toHaveBeenCalled();
  });

  it('auto-reverts to previous .installed-from when buildImage fails', async () => {
    writeMeta({ kind: 'tag', value: 'v2026.5.9', sha: 'old1234' });
    queriesMock.getVersion.mockReturnValue('v2026.5.9');
    stepsMock.buildImage.mockImplementationOnce(() => {
      throw new Error('docker daemon not responding');
    });
    await expect(
      upgrade.run?.({
        args: { to: 'v2026.5.10', yes: true },
        cmd: upgrade,
        rawArgs: [],
        data: undefined,
      } as never),
    ).rejects.toThrow('__exit__');
    expect(stepsMock.checkoutRef).toHaveBeenCalledTimes(2);
    // first call = forward to new tag, second call = revert to previous
    expect(stepsMock.checkoutRef.mock.calls[0]).toEqual(['v2026.5.10', 'tag']);
    expect(stepsMock.checkoutRef.mock.calls[1]).toEqual(['v2026.5.9', 'tag']);
    const errs = stderrChunks.join('\n');
    expect(errs).toMatch(/upgrade failed.*docker daemon/);
    expect(stdoutChunks.join('\n')).toMatch(/reverted to v2026.5.9/);
  });

  it('rejects mutually exclusive target flags', async () => {
    queriesMock.getVersion.mockReturnValue('v2026.5.9');
    await expect(
      upgrade.run?.({
        args: { unstable: true, branch: 'foo' },
        cmd: upgrade,
        rawArgs: [],
        data: undefined,
      } as never),
    ).rejects.toThrow('__exit__');
    expect(stderrChunks.join('\n')).toMatch(/--unstable.*--branch.*mutually exclusive/);
  });

  it('--unstable in non-TTY without --yes exits 1', async () => {
    queriesMock.getVersion.mockReturnValue('v2026.5.9');
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
    await expect(
      upgrade.run?.({
        args: { unstable: true },
        cmd: upgrade,
        rawArgs: [],
        data: undefined,
      } as never),
    ).rejects.toThrow('__exit__');
    expect(stderrChunks.join('\n')).toMatch(/--unstable requires --yes/);
  });

  it('downgrade requires --force', async () => {
    queriesMock.getVersion.mockReturnValue('v2026.5.10');
    await expect(
      upgrade.run?.({
        args: { to: 'v2026.5.9', yes: true },
        cmd: upgrade,
        rawArgs: [],
        data: undefined,
      } as never),
    ).rejects.toThrow('__exit__');
    expect(stderrChunks.join('\n')).toMatch(/downgrade.*requires --force/);
  });

  it('writes .installed-from after successful upgrade', async () => {
    queriesMock.getVersion.mockReturnValue('v2026.5.9');
    let metaWritten: { kind: string; value: string; sha: string } | null = null;
    stepsMock.writeMeta.mockImplementation((m) => {
      metaWritten = { kind: m.kind, value: m.value, sha: m.sha };
    });
    await upgrade.run?.({
      args: { to: 'v2026.5.10', yes: true },
      cmd: upgrade,
      rawArgs: [],
      data: undefined,
    } as never);
    expect(metaWritten).toEqual({ kind: 'tag', value: 'v2026.5.10', sha: 'aaa1111' });
    expect(stepsMock.setVersion).toHaveBeenCalledWith(dbConn, 'v2026.5.10');
    expect(stepsMock.buildImage).toHaveBeenCalled();
  });
});
