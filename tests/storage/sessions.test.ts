import { beforeEach, describe, expect, it } from 'vitest';
import { type DB, openDatabase } from '@/storage/db';
import { runMigrations } from '@/storage/migrations';
import { SessionRepo } from '@/storage/repos/sessions';

let db: DB;
let repo: SessionRepo;

beforeEach(() => {
  db = openDatabase(':memory:');
  runMigrations(db);
  repo = new SessionRepo(db);
});

describe('SessionRepo', () => {
  it('upsert + get returns the session id', () => {
    repo.upsert('thread-1', 'sess_abc');
    expect(repo.get('thread-1')).toBe('sess_abc');
  });

  it('upsert overwrites existing session id for same thread', () => {
    repo.upsert('thread-1', 'sess_old');
    repo.upsert('thread-1', 'sess_new');
    expect(repo.get('thread-1')).toBe('sess_new');
  });

  it('get returns null for unknown thread', () => {
    expect(repo.get('nope')).toBeNull();
  });

  it('delete removes the mapping', () => {
    repo.upsert('thread-1', 'sess_abc');
    repo.delete('thread-1');
    expect(repo.get('thread-1')).toBeNull();
  });

  it('list returns all sessions', () => {
    repo.upsert('a', 'sa');
    repo.upsert('b', 'sb');
    repo.upsert('c', 'sc');
    const list = repo.list();
    expect(list).toHaveLength(3);
    expect(list.map((s) => s.threadId).sort()).toEqual(['a', 'b', 'c']);
  });

  it('touch updates last_used_at without changing session_id', () => {
    repo.upsert('thread-1', 'sess_abc');
    repo.touch('thread-1');
    expect(repo.get('thread-1')).toBe('sess_abc');
  });
});
