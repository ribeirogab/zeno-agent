import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { composeArgs, composeFileExists } from '../compose.js';

describe('composeArgs', () => {
  it('returns the standard -f / --project-directory pair', () => {
    expect(composeArgs('/home/user/zeno-agent', 'default')).toEqual([
      '-f',
      'infra/docker-compose.default.yml',
      '--project-directory',
      '/home/user/zeno-agent',
    ]);
  });

  it('reflects the profile name in the compose file path', () => {
    expect(composeArgs('/repo', 'fn')).toEqual([
      '-f',
      'infra/docker-compose.fn.yml',
      '--project-directory',
      '/repo',
    ]);
  });
});

describe('composeFileExists', () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'zeno-compose-'));
    mkdirSync(join(home, 'infra'), { recursive: true });
    writeFileSync(join(home, 'infra', 'docker-compose.default.yml'), 'services: {}\n');
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  it('true when file exists', () => {
    expect(composeFileExists(home, 'default')).toBe(true);
  });

  it('false when file missing', () => {
    expect(composeFileExists(home, 'fn')).toBe(false);
  });
});
