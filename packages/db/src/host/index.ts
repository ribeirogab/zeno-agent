import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DB } from '../shared/client.js';
import { applyMigrations, loadMigrations } from '../shared/migrate.js';

export type { DB } from '../shared/client.js';
export { closeSqlite, openSqlite } from '../shared/client.js';
export type { AuditEntry, ProfileRow, ProfileStatus } from './queries.js';
export * as queries from './queries.js';
export * as schema from './schema.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(HERE, 'migrations');

export function runHostMigrations(db: DB): void {
  applyMigrations(db, loadMigrations(MIGRATIONS_DIR));
}
