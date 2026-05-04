import { beforeEach, describe, expect, it } from 'vitest';
import { closeDatabase, openDatabase } from '../../src/db';
import { runMigrations } from '../../src/migrations';
import { BackendCredentialsRepo } from '../../src/repos/backend-credentials';

const MASTER_KEY = Buffer.from('a'.repeat(64), 'hex');

describe('BackendCredentialsRepo', () => {
  let db: ReturnType<typeof openDatabase>;
  let repo: BackendCredentialsRepo;

  beforeEach(() => {
    db = openDatabase(':memory:');
    runMigrations(db);
    repo = new BackendCredentialsRepo(db, { masterKey: MASTER_KEY, profileId: 'default' });
  });

  it('upsert + getValue round-trip', () => {
    repo.upsert({ backendId: 'claude-code', fieldName: 'oauth_token', value: 'sk-ant-x' });
    expect(repo.getValue('claude-code', 'oauth_token')).toBe('sk-ant-x');
  });

  it('upsert overwrites existing value', () => {
    repo.upsert({ backendId: 'claude-code', fieldName: 'oauth_token', value: 'sk-ant-1' });
    repo.upsert({ backendId: 'claude-code', fieldName: 'oauth_token', value: 'sk-ant-2' });
    expect(repo.getValue('claude-code', 'oauth_token')).toBe('sk-ant-2');
  });

  it('returns null when no row exists', () => {
    expect(repo.getValue('claude-code', 'oauth_token')).toBeNull();
  });

  it('isolates rows across backends', () => {
    repo.upsert({ backendId: 'claude-code', fieldName: 'oauth_token', value: 'sk-ant-x' });
    repo.upsert({ backendId: 'codex-cli', fieldName: 'api_key', value: 'sk-openai-y' });
    expect(repo.getValue('claude-code', 'oauth_token')).toBe('sk-ant-x');
    expect(repo.getValue('codex-cli', 'api_key')).toBe('sk-openai-y');
  });

  it('isolates rows across profiles (DEK isolation)', () => {
    repo.upsert({ backendId: 'claude-code', fieldName: 'oauth_token', value: 'sk-ant-default' });
    const otherRepo = new BackendCredentialsRepo(db, { masterKey: MASTER_KEY, profileId: 'fn' });
    expect(otherRepo.getValue('claude-code', 'oauth_token')).toBeNull();
  });

  it('setStatus updates status + last_tested_at', () => {
    repo.upsert({ backendId: 'claude-code', fieldName: 'oauth_token', value: 'x' });
    const ts = 1700000000000;
    repo.setStatus('claude-code', 'active', ts);
    const all = repo.listStatuses();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      backendId: 'claude-code',
      status: 'active',
      lastTestedAt: ts,
      lastAuthAlertAt: null,
    });
  });

  it('setAuthAlertAt updates last_auth_alert_at', () => {
    repo.upsert({ backendId: 'claude-code', fieldName: 'oauth_token', value: 'x' });
    repo.setAuthAlertAt('claude-code', 1700000000000);
    expect(repo.listStatuses()[0]?.lastAuthAlertAt).toBe(1700000000000);
  });

  it('listStatuses collapses multiple field rows to one entry per backend', () => {
    repo.upsert({ backendId: 'claude-code', fieldName: 'oauth_token', value: 'a' });
    repo.upsert({ backendId: 'claude-code', fieldName: 'refresh_token', value: 'b' });
    expect(repo.listStatuses()).toHaveLength(1);
  });

  it('delete removes all field rows for the backend', () => {
    repo.upsert({ backendId: 'claude-code', fieldName: 'oauth_token', value: 'a' });
    repo.upsert({ backendId: 'claude-code', fieldName: 'refresh_token', value: 'b' });
    repo.delete('claude-code');
    expect(repo.getValue('claude-code', 'oauth_token')).toBeNull();
    expect(repo.getValue('claude-code', 'refresh_token')).toBeNull();
  });

  it('latestUpdatedAt advances on writes', async () => {
    expect(repo.latestUpdatedAt()).toBeNull();
    repo.upsert({ backendId: 'claude-code', fieldName: 'oauth_token', value: 'a' });
    const t1 = repo.latestUpdatedAt();
    expect(t1).not.toBeNull();
    await new Promise((r) => setTimeout(r, 5));
    repo.upsert({ backendId: 'claude-code', fieldName: 'oauth_token', value: 'b' });
    const t2 = repo.latestUpdatedAt();
    expect(t2).toBeGreaterThan(t1!);
    closeDatabase(db);
  });
});
