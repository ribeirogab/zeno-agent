import Database from 'better-sqlite3';

export type DB = Database.Database;

export function openSqlite(path: string): DB {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  return db;
}

export function closeSqlite(db: DB): void {
  db.close();
}
