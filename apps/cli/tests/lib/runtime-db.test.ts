import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openProfileRuntimeDb } from '../../src/lib/runtime-db.js';

describe('openProfileRuntimeDb', () => {
  let tmp: string;
  let dbPath: string;
  const HEX_KEY = 'a'.repeat(64);

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'zeno-runtime-db-test-'));
    dbPath = join(tmp, 'zeno.db');
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('opens the runtime DB, runs migrations, returns both repos', () => {
    const handle = openProfileRuntimeDb({ profile: 'test', masterKeyHex: HEX_KEY, dbPath });
    try {
      expect(handle.backendCredentialsRepo).toBeDefined();
      expect(handle.backendSettingsRepo).toBeDefined();
      expect(handle.backendCredentialsRepo.listStatuses()).toEqual([]);
      expect(handle.backendSettingsRepo.get('active_backend_id')).toBeNull();
    } finally {
      handle.close();
    }
  });

  it('round-trips an encrypted credential', () => {
    const handle = openProfileRuntimeDb({ profile: 'test', masterKeyHex: HEX_KEY, dbPath });
    try {
      handle.backendCredentialsRepo.upsert({
        backendId: 'claude-code',
        fieldName: 'oauth_token',
        value: 'sk-ant-secret',
      });
      expect(handle.backendCredentialsRepo.getValue('claude-code', 'oauth_token')).toBe(
        'sk-ant-secret',
      );
    } finally {
      handle.close();
    }
  });

  it('rejects malformed master keys', () => {
    expect(() =>
      openProfileRuntimeDb({ profile: 'test', masterKeyHex: 'deadbeef', dbPath }),
    ).toThrowError(/malformed/);
  });
});
