import type { DB } from '../db.js';

/**
 * Spec 0071 — small KV per `(profile_id, key)` for backend-related settings.
 *
 * Today the only key in use is `active_backend_id`, holding the catalog id of
 * the backend the worker should use. Future per-profile prefs (per-backend
 * model overrides, default temperature, etc.) live here too — keeps the
 * `backend_credentials` table strictly about credentials.
 *
 * Values are stored as plain TEXT — the worker treats them as catalog
 * identifiers, never secrets.
 */
export class BackendSettingsRepo {
  constructor(
    private readonly db: DB,
    private readonly profileId: string,
  ) {}

  get(key: string): string | null {
    const row = this.db
      .prepare(`SELECT value FROM backend_settings WHERE profile_id = ? AND key = ?`)
      .get(this.profileId, key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  set(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO backend_settings (profile_id, key, value, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(profile_id, key) DO UPDATE SET
           value = excluded.value,
           updated_at = excluded.updated_at`,
      )
      .run(this.profileId, key, value, Date.now());
  }
}
