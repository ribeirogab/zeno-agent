import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dbMock = vi.hoisted(() => ({}));
const queriesMock = vi.hoisted(() => ({
  listProfiles: vi.fn(),
  findProfile: vi.fn(),
  getSticky: vi.fn(),
}));
const pickMock = vi.hoisted(() => ({ pick: vi.fn() }));
const orchestratorMock = vi.hoisted(() => ({ listManagedContainers: vi.fn() }));

vi.mock('@/lib/state.js', () => ({
  db: () => dbMock,
}));
vi.mock('@zeno/db/host', () => ({
  queries: queriesMock,
}));
vi.mock('@/lib/picker.js', () => pickMock);
vi.mock('@/lib/orchestrator/singleton.js', () => ({
  orchestrator: () => orchestratorMock,
}));

import {
  resolveCatalog,
  resolveConnector,
  resolvePermission,
  resolveProfile,
  resolveSecretKey,
  resolveTool,
} from '@/lib/resolvers.js';

const setTTY = (value: boolean) => {
  Object.defineProperty(process.stdin, 'isTTY', { value, configurable: true });
  Object.defineProperty(process.stdout, 'isTTY', { value, configurable: true });
};

let exitSpy: ReturnType<typeof vi.spyOn>;
let stderrSpy: ReturnType<typeof vi.spyOn>;
let stdoutSpy: ReturnType<typeof vi.spyOn>;
let stderrChunks: string[];
let stdoutChunks: string[];

beforeEach(() => {
  exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
    throw new Error('__exit__');
  }) as never);
  stderrChunks = [];
  stdoutChunks = [];
  stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: unknown) => {
    stderrChunks.push(String(chunk));
    return true;
  }) as never);
  stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => {
    stdoutChunks.push(String(chunk));
    return true;
  }) as never);
  queriesMock.listProfiles.mockReset();
  queriesMock.findProfile.mockReset();
  queriesMock.getSticky.mockReset();
  pickMock.pick.mockReset();
  orchestratorMock.listManagedContainers.mockReset();
  // Default: daemon unreachable. Tests that exercise the picker should
  // overwrite this so the hint reflects live state.
  orchestratorMock.listManagedContainers.mockRejectedValue(new Error('daemon down'));
});

afterEach(() => {
  exitSpy.mockRestore();
  stderrSpy.mockRestore();
  stdoutSpy.mockRestore();
});

describe('resolveProfile', () => {
  it('returns the profile when arg is passed', async () => {
    queriesMock.findProfile.mockReturnValue({ name: 'fn', port: 6101 });
    const p = await resolveProfile('fn');
    expect(p.name).toBe('fn');
  });

  it('exits when arg refers to missing profile', async () => {
    queriesMock.findProfile.mockReturnValue(undefined);
    await expect(resolveProfile('ghost')).rejects.toThrow('__exit__');
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stderrChunks.join('')).toMatch(/profile 'ghost' not found/);
  });

  it('returns sticky when no arg + sticky exists', async () => {
    queriesMock.getSticky.mockReturnValue('fn');
    queriesMock.findProfile.mockReturnValue({ name: 'fn', port: 6101 });
    const p = await resolveProfile(undefined);
    expect(p.name).toBe('fn');
  });

  it('uses single profile + emits hint when only one exists, no sticky', async () => {
    setTTY(true);
    queriesMock.getSticky.mockReturnValue(null);
    queriesMock.listProfiles.mockReturnValue([{ name: 'only', port: 6101 }]);
    const p = await resolveProfile(undefined);
    expect(p.name).toBe('only');
    expect(stdoutChunks.join('')).toMatch(/zeno profile use only/);
  });

  it('opens picker even with 1 profile when ignoreSticky is set (lifecycle case)', async () => {
    setTTY(true);
    queriesMock.getSticky.mockReturnValue(null);
    queriesMock.listProfiles.mockReturnValue([{ name: 'only', port: 6101, status: 'running' }]);
    pickMock.pick.mockResolvedValue(0);
    const p = await resolveProfile(undefined, { ignoreSticky: true });
    expect(p.name).toBe('only');
    expect(pickMock.pick).toHaveBeenCalledTimes(1);
    // ignoreSticky path skips the "tip: zeno profile use ..." line.
    expect(stdoutChunks.join('')).not.toMatch(/zeno profile use/);
  });

  it('exits in non-TTY with 1 profile when ignoreSticky is set', async () => {
    setTTY(false);
    queriesMock.getSticky.mockReturnValue(null);
    queriesMock.listProfiles.mockReturnValue([{ name: 'only', port: 6101, status: 'running' }]);
    await expect(resolveProfile(undefined, { ignoreSticky: true })).rejects.toThrow('__exit__');
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stderrChunks.join('')).toMatch(/no profile specified/);
  });

  it('opens picker when no arg + no sticky + multiple profiles in TTY', async () => {
    setTTY(true);
    queriesMock.getSticky.mockReturnValue(null);
    queriesMock.listProfiles.mockReturnValue([
      { name: 'fn', port: 6101, status: 'running' },
      { name: 'work', port: 6102, status: 'stopped' },
    ]);
    pickMock.pick.mockResolvedValue(1);
    const p = await resolveProfile(undefined);
    expect(p.name).toBe('work');
    expect(stdoutChunks.join('')).toMatch(/zeno profile use work/);
  });

  it('exits when no arg + no sticky + non-TTY', async () => {
    setTTY(false);
    queriesMock.getSticky.mockReturnValue(null);
    queriesMock.listProfiles.mockReturnValue([
      { name: 'fn', port: 6101 },
      { name: 'work', port: 6102 },
    ]);
    await expect(resolveProfile(undefined)).rejects.toThrow('__exit__');
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stderrChunks.join('')).toMatch(/no profile specified/);
  });

  it('exits when no profiles exist', async () => {
    setTTY(true);
    queriesMock.getSticky.mockReturnValue(null);
    queriesMock.listProfiles.mockReturnValue([]);
    await expect(resolveProfile(undefined)).rejects.toThrow('__exit__');
    expect(stderrChunks.join('')).toMatch(/no profiles/);
  });

  it('picker hint reflects live state, overriding stale DB status', async () => {
    setTTY(true);
    queriesMock.getSticky.mockReturnValue(null);
    queriesMock.listProfiles.mockReturnValue([
      // DB lies: says running. Live snapshot says container is gone → stopped.
      { name: 'fn', port: 6101, status: 'running' },
      { name: 'work', port: 6102, status: 'stopped' },
    ]);
    orchestratorMock.listManagedContainers.mockResolvedValue([
      // No 'fn' container — fn must render as stopped, not running.
      { name: 'zeno-work', profile: 'work', port: 6102, state: 'stopped', startedAt: null },
    ]);
    pickMock.pick.mockResolvedValue(0);
    await resolveProfile(undefined);
    const callArgs = pickMock.pick.mock.calls[0]?.[0] as Array<{ label: string; hint: string }>;
    expect(callArgs).toBeDefined();
    // Strip ANSI codes for stable assertion.
    const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');
    expect(stripAnsi(callArgs[0]?.hint ?? '')).toBe('stopped');
    expect(stripAnsi(callArgs[1]?.hint ?? '')).toBe('stopped');
  });

  it('picker hint falls back to DB when daemon is unreachable', async () => {
    setTTY(true);
    queriesMock.getSticky.mockReturnValue(null);
    queriesMock.listProfiles.mockReturnValue([
      { name: 'fn', port: 6101, status: 'running' },
      { name: 'work', port: 6102, status: 'stopped' },
    ]);
    // Daemon unreachable (the default beforeEach sets this) — DB is the only source.
    pickMock.pick.mockResolvedValue(0);
    await resolveProfile(undefined);
    const callArgs = pickMock.pick.mock.calls[0]?.[0] as Array<{ label: string; hint: string }>;
    const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');
    expect(stripAnsi(callArgs[0]?.hint ?? '')).toBe('running');
    expect(stripAnsi(callArgs[1]?.hint ?? '')).toBe('stopped');
  });
});

describe('resolveConnector', () => {
  const src = { listConnectors: vi.fn() };
  beforeEach(() => src.listConnectors.mockReset());

  it('returns slug when passed', async () => {
    expect(await resolveConnector('linear-acme', src)).toBe('linear-acme');
    expect(src.listConnectors).not.toHaveBeenCalled();
  });

  it('opens picker when missing in TTY', async () => {
    setTTY(true);
    src.listConnectors.mockResolvedValue([{ slug: 'linear-acme', displayName: 'Linear (Acme)' }]);
    pickMock.pick.mockResolvedValue(0);
    expect(await resolveConnector(undefined, src)).toBe('linear-acme');
  });

  it('exits in non-TTY without arg', async () => {
    setTTY(false);
    await expect(resolveConnector(undefined, src)).rejects.toThrow('__exit__');
  });

  it('exits when list is empty', async () => {
    setTTY(true);
    src.listConnectors.mockResolvedValue([]);
    await expect(resolveConnector(undefined, src)).rejects.toThrow('__exit__');
  });
});

describe('resolveCatalog', () => {
  const src = { listCatalog: vi.fn() };
  beforeEach(() => src.listCatalog.mockReset());

  it('returns id when passed', async () => {
    expect(await resolveCatalog('linear', src)).toBe('linear');
  });

  it('opens picker when missing in TTY', async () => {
    setTTY(true);
    src.listCatalog.mockResolvedValue([{ id: 'linear', displayName: 'Linear' }, { id: 'sentry' }]);
    pickMock.pick.mockResolvedValue(1);
    expect(await resolveCatalog(undefined, src)).toBe('sentry');
  });
});

describe('resolveSecretKey', () => {
  const src = { listSecrets: vi.fn() };
  beforeEach(() => src.listSecrets.mockReset());

  it('returns key when passed', async () => {
    expect(await resolveSecretKey('__MCP_AUTHORIZATION__', src)).toBe('__MCP_AUTHORIZATION__');
  });

  it('opens picker when missing in TTY', async () => {
    setTTY(true);
    src.listSecrets.mockResolvedValue([{ key: 'A' }, { key: 'B' }]);
    pickMock.pick.mockResolvedValue(1);
    expect(await resolveSecretKey(undefined, src)).toBe('B');
  });
});

describe('resolveTool', () => {
  const src = { listTools: vi.fn() };
  beforeEach(() => src.listTools.mockReset());

  it('returns name when passed', async () => {
    expect(await resolveTool('create_issue', src)).toBe('create_issue');
  });

  it('opens picker when missing in TTY', async () => {
    setTTY(true);
    src.listTools.mockResolvedValue([
      { name: 'list_issues' },
      { name: 'create_issue', description: 'Create a new issue' },
    ]);
    pickMock.pick.mockResolvedValue(1);
    expect(await resolveTool(undefined, src)).toBe('create_issue');
  });
});

describe('resolvePermission', () => {
  it('returns valid value', async () => {
    expect(await resolvePermission('always_allow')).toBe('always_allow');
    expect(await resolvePermission('ask')).toBe('ask');
    expect(await resolvePermission('never')).toBe('never');
  });

  it('throws on invalid value', async () => {
    await expect(resolvePermission('invalid')).rejects.toThrow(/invalid permission/);
  });

  it('opens 3-option picker when missing in TTY', async () => {
    setTTY(true);
    pickMock.pick.mockResolvedValue(1);
    expect(await resolvePermission(undefined)).toBe('ask');
  });

  it('exits in non-TTY without arg', async () => {
    setTTY(false);
    await expect(resolvePermission(undefined)).rejects.toThrow('__exit__');
  });
});
