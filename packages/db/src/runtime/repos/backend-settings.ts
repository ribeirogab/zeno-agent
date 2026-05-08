import { and, eq } from 'drizzle-orm';
import type { RuntimeDB } from '../db.js';
import { backendSettings } from '../schema.js';

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
    private readonly db: RuntimeDB,
    private readonly profileId: string,
  ) {}

  get(key: string): string | null {
    const row = this.db
      .select({ value: backendSettings.value })
      .from(backendSettings)
      .where(
        and(eq(backendSettings.profileId, this.profileId), eq(backendSettings.key, key)),
      )
      .get();
    return row?.value ?? null;
  }

  set(key: string, value: string): void {
    const updatedAt = Date.now();
    this.db
      .insert(backendSettings)
      .values({ profileId: this.profileId, key, value, updatedAt })
      .onConflictDoUpdate({
        target: [backendSettings.profileId, backendSettings.key],
        set: { value, updatedAt },
      })
      .run();
  }
}
