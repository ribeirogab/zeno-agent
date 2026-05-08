import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import type { DB as RawDB } from '../shared/client.js';
import { closeSqlite, openSqlite } from '../shared/client.js';
import { applyMigrations, loadMigrations } from '../shared/migrate.js';
import * as schema from './schema.js';

export type RuntimeDB = BetterSQLite3Database<typeof schema>;

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(HERE, 'migrations');

export interface OpenRuntimeDatabase {
  raw: RawDB;
  drizzle: RuntimeDB;
  close: () => void;
}

export function openRuntimeDatabase(path: string): OpenRuntimeDatabase {
  const raw = openSqlite(path);
  const db = drizzle(raw, { schema });
  return {
    raw,
    drizzle: db,
    close: () => closeSqlite(raw),
  };
}

export function runRuntimeMigrations(raw: RawDB): void {
  applyMigrations(raw, loadMigrations(MIGRATIONS_DIR));
}
