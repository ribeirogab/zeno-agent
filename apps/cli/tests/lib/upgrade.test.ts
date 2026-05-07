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
    expect(pickTarget({}, RELEASES)).toBe('v2026.5.10');
  });

  it('--prerelease → first overall (including pre-release)', () => {
    expect(pickTarget({ prerelease: true }, RELEASES)).toBe('v2026.5.10');
  });

  it('--to <tag> → that tag, if present', () => {
    expect(pickTarget({ to: 'v2026.5.9' }, RELEASES)).toBe('v2026.5.9');
  });

  it('--to <missing> → error', () => {
    const r = pickTarget({ to: 'v9.9.9' }, RELEASES);
    expect(typeof r).toBe('object');
    expect(r).toEqual({ error: expect.stringContaining('v9.9.9') });
  });

  it('--edge → "edge"', () => {
    expect(pickTarget({ edge: true }, RELEASES)).toBe('edge');
  });
});
