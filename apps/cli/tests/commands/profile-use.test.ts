import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dbMock = vi.hoisted(() => ({}));
const queriesMock = vi.hoisted(() => ({
  listProfiles: vi.fn(),
  findProfile: vi.fn(),
  getSticky: vi.fn(),
  setSticky: vi.fn(),
  appendAudit: vi.fn(),
}));
const pickMock = vi.hoisted(() => ({ pick: vi.fn() }));
const requireProfileMock = vi.hoisted(() => ({ requireProfile: vi.fn() }));

vi.mock('@/lib/state.js', () => ({ db: () => dbMock }));
vi.mock('@zeno/db/host', () => ({ queries: queriesMock }));
vi.mock('@/lib/picker.js', () => pickMock);
vi.mock('@/lib/profile.js', () => requireProfileMock);

import profileUse from '@/commands/profile-use.js';

let exitSpy: ReturnType<typeof vi.spyOn>;
let stderrSpy: ReturnType<typeof vi.spyOn>;
let logSpy: ReturnType<typeof vi.spyOn>;
let stderrChunks: string[];
let logChunks: string[];

const setTTY = (value: boolean) => {
  Object.defineProperty(process.stdin, 'isTTY', { value, configurable: true });
  Object.defineProperty(process.stdout, 'isTTY', { value, configurable: true });
};

beforeEach(() => {
  exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
    throw new Error('__exit__');
  }) as never);
  stderrChunks = [];
  logChunks = [];
  stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: unknown) => {
    stderrChunks.push(String(chunk));
    return true;
  }) as never);
  logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logChunks.push(args.map(String).join(' '));
  });
  queriesMock.listProfiles.mockReset();
  queriesMock.findProfile.mockReset();
  queriesMock.getSticky.mockReset();
  queriesMock.setSticky.mockReset();
  queriesMock.appendAudit.mockReset();
  pickMock.pick.mockReset();
  requireProfileMock.requireProfile.mockReset();
});

afterEach(() => {
  exitSpy.mockRestore();
  stderrSpy.mockRestore();
  logSpy.mockRestore();
});

interface ProfileUseRunArgs {
  args: { name?: string; clear?: boolean; quiet?: boolean };
}

const run = (args: ProfileUseRunArgs['args']) =>
  // biome-ignore lint/suspicious/noExplicitAny: citty plumbing not relevant to the test
  (profileUse as any).run({ args });

describe('zeno profile use --clear', () => {
  it('clears the sticky default and prints "sticky cleared"', async () => {
    await run({ clear: true });
    expect(queriesMock.setSticky).toHaveBeenCalledWith(dbMock, null);
    expect(queriesMock.appendAudit).toHaveBeenCalledWith(
      dbMock,
      expect.objectContaining({ action: 'profile.use', target: null }),
    );
    expect(logChunks.join('\n')).toMatch(/sticky cleared/);
    // The picker must NOT be opened.
    expect(pickMock.pick).not.toHaveBeenCalled();
    expect(requireProfileMock.requireProfile).not.toHaveBeenCalled();
  });

  it('refuses --clear together with a positional profile name', async () => {
    await expect(run({ clear: true, name: 'fn' })).rejects.toThrow('__exit__');
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stderrChunks.join('')).toMatch(/mutually exclusive/);
    expect(queriesMock.setSticky).not.toHaveBeenCalled();
  });

  it('sets sticky when a positional name is given (no --clear)', async () => {
    requireProfileMock.requireProfile.mockReturnValue({ name: 'fn' });
    await run({ name: 'fn' });
    expect(requireProfileMock.requireProfile).toHaveBeenCalledWith(dbMock, 'fn');
    expect(queriesMock.setSticky).toHaveBeenCalledWith(dbMock, 'fn');
    expect(logChunks.join('\n')).toMatch(/Sticky profile set to/);
  });

  it('opens picker when no arg + TTY (no --clear)', async () => {
    setTTY(true);
    queriesMock.listProfiles.mockReturnValue([
      { name: 'fn', port: 6101 },
      { name: 'work', port: 6102 },
    ]);
    queriesMock.getSticky.mockReturnValue('fn');
    pickMock.pick.mockResolvedValue(1);
    requireProfileMock.requireProfile.mockReturnValue({ name: 'work' });
    await run({});
    expect(pickMock.pick).toHaveBeenCalledTimes(1);
    expect(queriesMock.setSticky).toHaveBeenCalledWith(dbMock, 'work');
  });
});
