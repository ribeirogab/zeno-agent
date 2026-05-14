import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type SpawnArgs = [string, readonly string[], { env?: Record<string, string> }?];

const homeRef = vi.hoisted(() => ({ value: '/__placeholder__' }));
const spawnSyncMock = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => unknown>(() => ({
    status: 0,
    stdout: '',
    stderr: '',
    signal: null,
    output: [],
    pid: 0,
  })),
);

vi.mock('@/lib/paths.js', () => ({
  get ZENO_HOME() {
    return homeRef.value;
  },
}));
vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  return { ...actual, spawnSync: spawnSyncMock };
});

import { pickTarget, type Release, upgradeSteps } from '@/lib/upgrade.js';

const RELEASES: Release[] = [
  { tag: 'v2026.5.10', prerelease: false, publishedAt: '2026-05-09' },
  { tag: 'v2026.5.10-rc.1', prerelease: true, publishedAt: '2026-05-09' },
  { tag: 'v2026.5.9', prerelease: false, publishedAt: '2026-05-08' },
  { tag: 'v2026.5.8', prerelease: false, publishedAt: '2026-05-07' },
];

describe('pickTarget', () => {
  it('default → first stable', () => {
    expect(pickTarget({}, RELEASES)).toEqual({ kind: 'tag', value: 'v2026.5.10' });
  });

  it('--prerelease → first overall (including pre-release)', () => {
    expect(pickTarget({ prerelease: true }, RELEASES)).toEqual({
      kind: 'tag',
      value: 'v2026.5.10',
    });
  });

  it('--to <tag> → that tag, if present', () => {
    expect(pickTarget({ to: 'v2026.5.9' }, RELEASES)).toEqual({
      kind: 'tag',
      value: 'v2026.5.9',
    });
  });

  it('--to <missing> → error', () => {
    const r = pickTarget({ to: 'v9.9.9' }, RELEASES);
    expect('error' in r).toBe(true);
    if ('error' in r) {
      expect(r.error).toContain('v9.9.9');
    }
  });

  it('--unstable → kind=unstable', () => {
    expect(pickTarget({ unstable: true }, RELEASES)).toEqual({ kind: 'unstable', value: '' });
  });

  it('--branch <name> → kind=branch', () => {
    expect(pickTarget({ branch: 'feat/foo' }, RELEASES)).toEqual({
      kind: 'branch',
      value: 'feat/foo',
    });
  });

  it('--pr <number> → kind=pr', () => {
    expect(pickTarget({ pr: '123' }, RELEASES)).toEqual({ kind: 'pr', value: '123' });
  });

  it('empty releases default → unstable', () => {
    expect(pickTarget({}, [])).toEqual({ kind: 'unstable', value: '' });
  });
});

describe('upgradeSteps.bootstrapPnpm', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'zeno-bp-'));
    homeRef.value = tmp;
    spawnSyncMock.mockClear();
    spawnSyncMock.mockReturnValue({
      status: 0,
      stdout: '',
      stderr: '',
      signal: null,
      output: [],
      pid: 0,
    } as never);
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('invokes corepack enable then corepack prepare pnpm@<version> --activate', () => {
    writeFileSync(
      join(tmp, 'package.json'),
      JSON.stringify({ name: 'zeno-agent', packageManager: 'pnpm@10.33.0' }),
    );
    upgradeSteps.bootstrapPnpm();
    expect(spawnSyncMock).toHaveBeenCalledTimes(2);
    const calls = spawnSyncMock.mock.calls as unknown as SpawnArgs[];
    expect(calls[0]?.[0]).toBe('corepack');
    expect(calls[0]?.[1]).toEqual(['enable']);
    expect(calls[1]?.[0]).toBe('corepack');
    expect(calls[1]?.[1]).toEqual(['prepare', 'pnpm@10.33.0', '--activate']);
  });

  it('sets COREPACK_ENABLE_DOWNLOAD_PROMPT=0 in spawn env', () => {
    writeFileSync(
      join(tmp, 'package.json'),
      JSON.stringify({ packageManager: 'pnpm@10.33.0' }),
    );
    upgradeSteps.bootstrapPnpm();
    const calls = spawnSyncMock.mock.calls as unknown as SpawnArgs[];
    for (const call of calls) {
      expect(call[2]?.env?.COREPACK_ENABLE_DOWNLOAD_PROMPT).toBe('0');
    }
  });

  it('throws a specific message when package.json lacks packageManager', () => {
    writeFileSync(join(tmp, 'package.json'), JSON.stringify({ name: 'zeno-agent' }));
    expect(() => upgradeSteps.bootstrapPnpm()).toThrow(
      /package\.json missing "packageManager" field/,
    );
    expect(spawnSyncMock).not.toHaveBeenCalled();
  });

  it('throws when corepack exits non-zero', () => {
    writeFileSync(
      join(tmp, 'package.json'),
      JSON.stringify({ packageManager: 'pnpm@10.33.0' }),
    );
    spawnSyncMock.mockReturnValueOnce({
      status: 0,
      stdout: '',
      stderr: '',
      signal: null,
      output: [],
      pid: 0,
    } as never);
    spawnSyncMock.mockReturnValueOnce({
      status: 1,
      stdout: '',
      stderr: 'corepack: signature mismatch',
      signal: null,
      output: [],
      pid: 0,
    } as never);
    expect(() => upgradeSteps.bootstrapPnpm()).toThrow(/bootstrapPnpm failed/);
  });
});
