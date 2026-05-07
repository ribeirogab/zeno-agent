import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readVersion } from '../version.js';

describe('readVersion', () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'zeno-version-'));
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  it('reads version from $home/package.json', () => {
    writeFileSync(join(home, 'package.json'), JSON.stringify({ version: '2026.5.7' }));
    expect(readVersion(home)).toBe('2026.5.7');
  });

  it('throws when package.json missing', () => {
    expect(() => readVersion(home)).toThrow(/cannot read/);
  });

  it('throws when version field absent', () => {
    writeFileSync(join(home, 'package.json'), JSON.stringify({ name: 'foo' }));
    expect(() => readVersion(home)).toThrow(/no "version" field/);
  });
});
