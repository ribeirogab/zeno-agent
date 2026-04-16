import Database from 'better-sqlite3';
import { logger } from '@/logger';

export type DB = Database.Database;

/**
 * Open a SQLite database with WAL mode and sane pragmas for crash-safety.
 * Use ':memory:' for tests.
 */
export function openDatabase(path: string): DB {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  logger.info(
    { event: 'db_opened', path, journalMode: db.pragma('journal_mode', { simple: true }) },
    'database opened',
  );
  return db;
}

export function closeDatabase(db: DB): void {
  db.close();
  logger.info({ event: 'db_closed' }, 'database closed');
}
