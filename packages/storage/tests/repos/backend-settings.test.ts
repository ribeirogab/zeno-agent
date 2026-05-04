import { beforeEach, describe, expect, it } from 'vitest';
import { closeDatabase, openDatabase } from '../../src/db';
import { runMigrations } from '../../src/migrations';
import { BackendSettingsRepo } from '../../src/repos/backend-settings';

describe('BackendSettingsRepo', () => {
  let db: ReturnType<typeof openDatabase>;
  let repo: BackendSettingsRepo;

  beforeEach(() => {
    db = openDatabase(':memory:');
    runMigrations(db);
    repo = new BackendSettingsRepo(db, 'default');
  });

  it('returns null for unknown key', () => {
    expect(repo.get('active_backend_id')).toBeNull();
    closeDatabase(db);
  });

  it('upsert + get round-trip', () => {
    repo.set('active_backend_id', 'claude-code');
    expect(repo.get('active_backend_id')).toBe('claude-code');
    repo.set('active_backend_id', 'codex-cli');
    expect(repo.get('active_backend_id')).toBe('codex-cli');
    closeDatabase(db);
  });

  it('isolates rows across profiles', () => {
    repo.set('active_backend_id', 'claude-code');
    const otherProfile = new BackendSettingsRepo(db, 'fn');
    expect(otherProfile.get('active_backend_id')).toBeNull();
    closeDatabase(db);
  });
});
