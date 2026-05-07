// Lazily opens the host state DB at ~/.zeno/state.db, runs migrations once,
// and returns a singleton handle. Process exit closes implicitly.

import { chmodSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { type DB, openSqlite, runHostMigrations } from '@zeno/db/host';
import { STATE_DB_PATH } from './paths.js';

let cached: DB | null = null;

export function db(): DB {
  if (cached) return cached;
  const dir = dirname(STATE_DB_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const isNew = !existsSync(STATE_DB_PATH);
  cached = openSqlite(STATE_DB_PATH);
  runHostMigrations(cached);
  // Owner-only read/write — state.db holds master keys plaintext.
  try {
    if (isNew || (statSync(STATE_DB_PATH).mode & 0o077) !== 0) {
      chmodSync(STATE_DB_PATH, 0o600);
    }
  } catch {
    /* best-effort; chmod may not exist on Windows */
  }
  return cached;
}
