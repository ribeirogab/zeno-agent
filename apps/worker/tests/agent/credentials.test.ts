import {
  BackendCredentialsRepo,
  openRuntimeDatabase,
  runRuntimeMigrations,
} from '@zeno/db/runtime';
import { beforeEach, describe, expect, it } from 'vitest';
import { CredentialsService, NoBackendConfiguredError } from '@/agent/credentials';

const MASTER_KEY = Buffer.from('a'.repeat(64), 'hex');

describe('CredentialsService', () => {
  let svc: CredentialsService;
  let repo: BackendCredentialsRepo;

  beforeEach(() => {
    const opened = openRuntimeDatabase(':memory:');
    runRuntimeMigrations(opened.raw);
    repo = new BackendCredentialsRepo(opened.drizzle, {
      masterKey: MASTER_KEY,
      profileId: 'default',
    });
    svc = new CredentialsService({ repo });
  });

  it('returns the decrypted token for the active backend', () => {
    repo.upsert({ backendId: 'claude-code', fieldName: 'oauth_token', value: 'sk-ant-real' });
    expect(svc.getActiveBackendToken({ backendId: 'claude-code' })).toBe('sk-ant-real');
  });

  it('returns null when no row exists', () => {
    expect(svc.getActiveBackendToken({ backendId: 'claude-code' })).toBeNull();
  });

  it('NEVER mutates process.env', () => {
    const before = { ...process.env };
    repo.upsert({ backendId: 'claude-code', fieldName: 'oauth_token', value: 'sk-ant-x' });
    svc.getActiveBackendToken({ backendId: 'claude-code' });
    expect(process.env).toEqual(before);
    expect(process.env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
  });

  it('require throws NoBackendConfiguredError when missing', () => {
    expect(() => svc.requireActiveBackendToken({ backendId: 'claude-code' })).toThrow(
      NoBackendConfiguredError,
    );
  });

  it('require returns token when configured', () => {
    repo.upsert({ backendId: 'claude-code', fieldName: 'oauth_token', value: 'sk-ant-x' });
    expect(svc.requireActiveBackendToken({ backendId: 'claude-code' })).toBe('sk-ant-x');
  });
});
