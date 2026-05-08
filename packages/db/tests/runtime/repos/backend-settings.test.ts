import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  openRuntimeDatabase,
  type RuntimeDB,
  runRuntimeMigrations,
} from '../../../src/runtime/db.js';
import { BackendSettingsRepo } from '../../../src/runtime/repos/backend-settings.js';

describe('BackendSettingsRepo', () => {
  let db: RuntimeDB;
  let close: () => void;
  let repo: BackendSettingsRepo;

  beforeEach(() => {
    const opened = openRuntimeDatabase(':memory:');
    runRuntimeMigrations(opened.raw);
    db = opened.drizzle;
    close = opened.close;
    repo = new BackendSettingsRepo(db, 'default');
  });

  afterEach(() => {
    close();
  });

  it('returns null for unknown key', () => {
    expect(repo.get('active_backend_id')).toBeNull();
  });

  it('upsert + get round-trip', () => {
    repo.set('active_backend_id', 'claude-code');
    expect(repo.get('active_backend_id')).toBe('claude-code');
    repo.set('active_backend_id', 'codex-cli');
    expect(repo.get('active_backend_id')).toBe('codex-cli');
  });

  it('isolates rows across profiles', () => {
    repo.set('active_backend_id', 'claude-code');
    const otherProfile = new BackendSettingsRepo(db, 'work');
    expect(otherProfile.get('active_backend_id')).toBeNull();
  });
});
