import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const homeRef = vi.hoisted(() => ({ value: '/__placeholder__' }));

vi.mock('@/lib/paths.js', () => ({
  get ZENO_HOME() {
    return homeRef.value;
  },
}));

import {
  compareSemver,
  formatDisplay,
  parseMetaLine,
  readMeta,
  type VersionMeta,
  writeMeta,
} from '@/lib/version-meta.js';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'zeno-vm-'));
  homeRef.value = tmp;
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('writeMeta + readMeta roundtrip', () => {
  const cases: VersionMeta[] = [
    { kind: 'tag', value: 'v2026.5.7', sha: 'a1b2c3d' },
    { kind: 'branch', value: 'feat/foo', sha: 'a1b2c3d' },
    { kind: 'pr', value: '123', sha: 'a1b2c3d' },
    { kind: 'unstable', value: '', sha: 'a1b2c3d' },
  ];

  for (const meta of cases) {
    it(`roundtrips ${meta.kind}:${meta.value}`, () => {
      writeMeta(meta);
      expect(readMeta()).toEqual(meta);
    });
  }

  it('writes the documented line format', () => {
    writeMeta({ kind: 'tag', value: 'v2026.5.7', sha: 'a1b2c3d' });
    const content = readFileSync(join(tmp, '.installed-from'), 'utf8').trim();
    expect(content).toBe('tag:v2026.5.7@a1b2c3d');
  });

  it('reads a line written by install.sh', () => {
    writeFileSync(join(tmp, '.installed-from'), 'pr:123@a1b2c3d\n');
    expect(readMeta()).toEqual({ kind: 'pr', value: '123', sha: 'a1b2c3d' });
  });
});

describe('readMeta', () => {
  it('returns null when the file is absent', () => {
    expect(readMeta()).toBeNull();
  });

  it('returns null when the file is malformed (no @)', () => {
    writeFileSync(join(tmp, '.installed-from'), 'tag:v2026.5.7\n');
    expect(readMeta()).toBeNull();
  });

  it('returns null when the kind is unknown', () => {
    writeFileSync(join(tmp, '.installed-from'), 'mystery:foo@abc\n');
    expect(readMeta()).toBeNull();
  });
});

describe('parseMetaLine', () => {
  it('parses unstable with empty value', () => {
    expect(parseMetaLine('unstable:@a1b2c3d')).toEqual({
      kind: 'unstable',
      value: '',
      sha: 'a1b2c3d',
    });
  });

  it('handles branch values with slashes', () => {
    expect(parseMetaLine('branch:feat/foo/bar@abc')).toEqual({
      kind: 'branch',
      value: 'feat/foo/bar',
      sha: 'abc',
    });
  });
});

describe('formatDisplay', () => {
  const cases: Array<[VersionMeta, string]> = [
    [{ kind: 'tag', value: 'v2026.5.7', sha: 'a1b2c3d' }, 'v2026.5.7'],
    [{ kind: 'branch', value: 'feat/foo', sha: 'a1b2c3d' }, 'branch:feat/foo (a1b2c3d)'],
    [{ kind: 'pr', value: '123', sha: 'a1b2c3d' }, 'pr:#123 (a1b2c3d)'],
    [{ kind: 'unstable', value: '', sha: 'a1b2c3d' }, 'unstable (a1b2c3d)'],
  ];

  for (const [meta, expected] of cases) {
    it(`renders ${meta.kind} as ${expected}`, () => {
      expect(formatDisplay(meta)).toBe(expected);
    });
  }
});

describe('compareSemver', () => {
  it('newer minor returns positive', () => {
    expect(compareSemver('v2026.5.10', 'v2026.5.9')).toBeGreaterThan(0);
  });

  it('older minor returns negative', () => {
    expect(compareSemver('v2026.5.9', 'v2026.5.10')).toBeLessThan(0);
  });

  it('hyphen suffix sorts after base', () => {
    expect(compareSemver('v2026.5.9-1', 'v2026.5.9')).toBeGreaterThan(0);
  });

  it('equal versions return zero', () => {
    expect(compareSemver('v2026.5.9', 'v2026.5.9')).toBe(0);
  });

  it('handles missing v prefix', () => {
    expect(compareSemver('2026.5.10', 'v2026.5.9')).toBeGreaterThan(0);
  });

  it('major bump dominates minor', () => {
    expect(compareSemver('v2027.0.0', 'v2026.99.99')).toBeGreaterThan(0);
  });
});
