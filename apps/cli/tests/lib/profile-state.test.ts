import type { ProfileRow } from '@zeno/db/host';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const orchestratorMock = vi.hoisted(() => ({
  listManagedContainers: vi.fn(),
}));

vi.mock('@/lib/orchestrator/singleton.js', () => ({
  orchestrator: () => orchestratorMock,
}));

import { resolveLiveStatus, snapshotLive } from '@/lib/profile-state.js';

const profile = (overrides: Partial<ProfileRow> = {}): ProfileRow =>
  ({
    name: 'fn',
    port: 6101,
    masterKey: 'k',
    status: 'stopped',
    createdAt: 0,
    lastStartedAt: null,
    lastStoppedAt: null,
    ...overrides,
  }) as ProfileRow;

beforeEach(() => {
  orchestratorMock.listManagedContainers.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('snapshotLive', () => {
  it('marks reachable=true and indexes containers by profile name', async () => {
    orchestratorMock.listManagedContainers.mockResolvedValue([
      { name: 'zeno-fn', profile: 'fn', port: 6101, state: 'running', startedAt: null },
      { name: 'zeno-work', profile: 'work', port: 6102, state: 'stopped', startedAt: null },
    ]);
    const snap = await snapshotLive();
    expect(snap.reachable).toBe(true);
    expect(snap.liveByName.get('fn')).toBe('running');
    expect(snap.liveByName.get('work')).toBe('stopped');
  });

  it('marks reachable=false on daemon failure (does not throw)', async () => {
    orchestratorMock.listManagedContainers.mockRejectedValue(new Error('docker socket gone'));
    const snap = await snapshotLive();
    expect(snap.reachable).toBe(false);
    expect(snap.liveByName.size).toBe(0);
  });

  it('marks reachable=true with empty map when no containers exist', async () => {
    orchestratorMock.listManagedContainers.mockResolvedValue([]);
    const snap = await snapshotLive();
    expect(snap.reachable).toBe(true);
    expect(snap.liveByName.size).toBe(0);
  });
});

describe('resolveLiveStatus', () => {
  it('returns DB status when daemon is unreachable', () => {
    const snap = { reachable: false, liveByName: new Map() };
    expect(resolveLiveStatus(profile({ status: 'running' }), snap)).toBe('running');
    expect(resolveLiveStatus(profile({ status: 'stopped' }), snap)).toBe('stopped');
    expect(resolveLiveStatus(profile({ status: 'failed' }), snap)).toBe('failed');
  });

  it('returns the live state when reachable and container is present', () => {
    const snap = {
      reachable: true,
      liveByName: new Map<string, 'running' | 'stopped' | 'failed'>([['fn', 'running']]),
    };
    // DB says stopped — live wins.
    expect(resolveLiveStatus(profile({ name: 'fn', status: 'stopped' }), snap)).toBe('running');
  });

  it("returns 'stopped' when reachable but container is missing (overrides stale DB)", () => {
    // This is the canonical bug the helper exists to prevent: DB says
    // running, container vanished out-of-band, live snapshot has no row,
    // we MUST report stopped — never the stale running.
    const snap = { reachable: true, liveByName: new Map() };
    expect(resolveLiveStatus(profile({ name: 'fn', status: 'running' }), snap)).toBe('stopped');
  });

  it('returns the failed state when container exists in failed state', () => {
    const snap = {
      reachable: true,
      liveByName: new Map<string, 'running' | 'stopped' | 'failed'>([['fn', 'failed']]),
    };
    expect(resolveLiveStatus(profile({ name: 'fn', status: 'running' }), snap)).toBe('failed');
  });
});
