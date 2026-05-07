import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readState, writeState } from '../state.js';

describe('state', () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'zeno-state-'));
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  it('readState returns empty object when state file missing', () => {
    expect(readState(home)).toEqual({});
  });

  it('writeState then readState round-trips', () => {
    writeState(home, { profile: 'fn' });
    expect(readState(home)).toEqual({ profile: 'fn' });
  });

  it('writeState creates apps/cli directory if missing', () => {
    writeState(home, { profile: 'default' });
    expect(readState(home).profile).toBe('default');
  });

  it('readState returns empty object on malformed JSON', () => {
    writeState(home, { profile: 'default' });
    const path = join(home, 'apps', 'cli', '.state.json');
    writeFileSync(path, 'not json');
    expect(readState(home)).toEqual({});
  });
});
