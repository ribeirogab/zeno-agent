import { desc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { DB } from '../shared/client.js';
import { auditLog, profiles, settings } from './schema.js';

export type ProfileStatus = 'running' | 'stopped' | 'failed';

export interface ProfileRow {
  name: string;
  port: number;
  masterKey: string;
  status: ProfileStatus;
  createdAt: number;
  lastStartedAt: number | null;
  lastStoppedAt: number | null;
}

export interface AuditEntry {
  id: number;
  ts: number;
  action: string;
  target: string | null;
  details: string;
}

function d(db: DB) {
  return drizzle(db);
}

// ─── profiles ─────────────────────────────────────────────────────────────

export function createProfile(
  db: DB,
  input: { name: string; port: number; masterKey: string },
): void {
  d(db)
    .insert(profiles)
    .values({
      name: input.name,
      port: input.port,
      masterKey: input.masterKey,
      status: 'stopped',
      createdAt: Date.now(),
    })
    .run();
}

export function findProfile(db: DB, name: string): ProfileRow | undefined {
  const rows = d(db).select().from(profiles).where(eq(profiles.name, name)).all();
  return rows[0] as ProfileRow | undefined;
}

export function listProfiles(db: DB): ProfileRow[] {
  return d(db).select().from(profiles).orderBy(profiles.createdAt).all() as ProfileRow[];
}

export function updateProfilePort(db: DB, name: string, port: number): void {
  d(db).update(profiles).set({ port }).where(eq(profiles.name, name)).run();
}

export function updateProfileStatus(
  db: DB,
  name: string,
  patch: { status: ProfileStatus; lastStartedAt?: number; lastStoppedAt?: number },
): void {
  d(db).update(profiles).set(patch).where(eq(profiles.name, name)).run();
}

export function deleteProfile(db: DB, name: string): void {
  d(db).delete(profiles).where(eq(profiles.name, name)).run();
}

// ─── settings (key/value) ─────────────────────────────────────────────────

function getSetting(db: DB, key: string): string | null {
  const row = d(db).select().from(settings).where(eq(settings.key, key)).get();
  return row ? (row as { key: string; value: string }).value : null;
}

function setSetting(db: DB, key: string, value: string | null): void {
  if (value === null) {
    d(db).delete(settings).where(eq(settings.key, key)).run();
    return;
  }
  d(db)
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
}

export function getSticky(db: DB): string | null {
  return getSetting(db, 'current_profile');
}

export function setSticky(db: DB, name: string | null): void {
  setSetting(db, 'current_profile', name);
}

export function getVersion(db: DB): string | null {
  return getSetting(db, 'current_version');
}

export function setVersion(db: DB, version: string): void {
  setSetting(db, 'current_version', version);
}

// ─── audit ────────────────────────────────────────────────────────────────

export function appendAudit(
  db: DB,
  entry: { action: string; target: string | null; details?: Record<string, unknown> },
): void {
  d(db)
    .insert(auditLog)
    .values({
      ts: Date.now(),
      action: entry.action,
      target: entry.target,
      details: JSON.stringify(entry.details ?? {}),
    })
    .run();
}

export function listAudit(db: DB, opts: { limit?: number } = {}): AuditEntry[] {
  const q = d(db).select().from(auditLog).orderBy(desc(auditLog.ts), desc(auditLog.id));
  const rows = (opts.limit ? q.limit(opts.limit).all() : q.all()) as AuditEntry[];
  return rows;
}
