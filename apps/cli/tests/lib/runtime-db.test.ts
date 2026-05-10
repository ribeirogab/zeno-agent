import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openProfileRuntimeDb } from '../../src/lib/runtime-db.js';

describe('openProfileRuntimeDb', () => {
  let tmp: string;
  const HEX_KEY = 'a'.repeat(64);

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'zeno-runtime-db-test-'));
    // Redirect HOME so workspaceBindPath() resolves under our temp dir.
    vi.stubEnv('HOME', tmp);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(tmp, { recursive: true, force: true });
  });

  it('opens the runtime DB, runs migrations, returns both repos', () => {
    const handle = openProfileRuntimeDb({ profile: 'test', masterKeyHex: HEX_KEY });
    try {
      expect(handle.backendCredentialsRepo).toBeDefined();
      expect(handle.backendSettingsRepo).toBeDefined();
      // After migrations, listStatuses() should return [] (table exists).
      expect(handle.backendCredentialsRepo.listStatuses()).toEqual([]);
      // backendSettings starts empty.
      expect(handle.backendSettingsRepo.get('active_backend_id')).toBeNull();
    } finally {
      handle.close();
    }
  });

  it('round-trips an encrypted credential', () => {
    const handle = openProfileRuntimeDb({ profile: 'test', masterKeyHex: HEX_KEY });
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
      openProfileRuntimeDb({ profile: 'test', masterKeyHex: 'deadbeef' }),
    ).toThrowError(/malformed/);
  });
});
