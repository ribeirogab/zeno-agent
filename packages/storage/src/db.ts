import Database from 'better-sqlite3';

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
  return db;
}

export function closeDatabase(db: DB): void {
  db.close();
}
