import { describe, expect, it } from 'vitest';
import { pickTarget, type Release } from '@/lib/upgrade.js';

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
