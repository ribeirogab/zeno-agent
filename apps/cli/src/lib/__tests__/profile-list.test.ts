import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listProfiles } from '../profile-list.js';

describe('listProfiles', () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'zeno-profilelist-'));
    mkdirSync(join(home, 'infra'), { recursive: true });
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  it('returns empty list when no compose files', () => {
    expect(listProfiles(home)).toEqual([]);
  });

  it('extracts names from docker-compose.<name>.yml', () => {
    writeFileSync(join(home, 'infra', 'docker-compose.default.yml'), '');
    writeFileSync(join(home, 'infra', 'docker-compose.fn.yml'), '');
    expect(listProfiles(home)).toEqual(['default', 'fn']);
  });

  it('ignores non-matching files', () => {
    writeFileSync(join(home, 'infra', 'docker-compose.default.yml'), '');
    writeFileSync(join(home, 'infra', 'Dockerfile'), '');
    writeFileSync(join(home, 'infra', 'docker-compose.yml'), '');
    expect(listProfiles(home)).toEqual(['default']);
  });

  it('returns empty list when infra directory missing', () => {
    rmSync(join(home, 'infra'), { recursive: true, force: true });
    expect(listProfiles(home)).toEqual([]);
  });
});
