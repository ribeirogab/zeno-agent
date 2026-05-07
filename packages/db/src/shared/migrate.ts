import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DB } from './client.js';

export interface MigrationFile {
  version: number;
  name: string;
  sql: string;
}

const MIGRATION_RE = /^(\d+)_(.+)\.sql$/;

export function loadMigrations(dir: string): MigrationFile[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => {
      const match = f.match(MIGRATION_RE);
      if (!match) throw new Error(`bad migration filename: ${f}`);
      return {
        version: Number(match[1]),
        name: match[2] ?? '',
        sql: readFileSync(join(dir, f), 'utf8'),
      };
    });
}

export function applyMigrations(db: DB, migrations: MigrationFile[]): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);
  const applied = new Set(
    (db.prepare(`SELECT version FROM schema_migrations`).all() as { version: number }[]).map(
      (r) => r.version,
    ),
  );
  const insert = db.prepare(
    `INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)`,
  );
  const tx = db.transaction((batch: MigrationFile[]) => {
    for (const m of batch) {
      if (applied.has(m.version)) continue;
      db.exec(m.sql);
      insert.run(m.version, m.name, Date.now());
    }
  });
  tx(migrations);
}
