import { unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { closeSqlite, openSqlite } from '../src/shared/client.js';

const TMP = join(tmpdir(), `zeno-db-client-${Date.now()}.db`);

afterEach(() => {
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      unlinkSync(`${TMP}${suffix}`);
    } catch {
      /* ignore */
    }
  }
});

it('opens with WAL journal mode and required pragmas', () => {
  const db = openSqlite(TMP);
  const wal = db.pragma('journal_mode', { simple: true });
  const sync = db.pragma('synchronous', { simple: true });
  const fk = db.pragma('foreign_keys', { simple: true });
  expect(wal).toBe('wal');
  expect(sync).toBe(1);
  expect(fk).toBe(1);
  closeSqlite(db);
});
