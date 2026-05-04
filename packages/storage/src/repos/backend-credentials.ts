import { randomUUID } from 'node:crypto';
import { decrypt, encrypt } from '../crypto.js';
import type { DB } from '../db.js';

/**
 * Spec 0071 — `backend_credentials` repo. Every row is an encrypted KV: one
 * row per `(profile_id, backend_id, field_name)`. Today only `oauth_token` is
 * used for `claude-code`; future backends (codex-cli, gemini, ...) may use
 * multiple fields per their `auth_schema` in `agent/backends-catalog.json`.
 *
 * Reads/writes ALWAYS go through `crypto.ts` — no SQL ever sees plaintext.
 * Per-profile DEK derivation means a leaked profile DEK can't decrypt other
 * profiles' rows.
 */

export type BackendStatus = 'untested' | 'active' | 'expired' | 'failed';

export interface BackendCredentialStatus {
  backendId: string;
  status: BackendStatus;
  lastTestedAt: number | null;
  lastAuthAlertAt: number | null;
}

interface RepoOpts {
  masterKey: Buffer;
  profileId: string;
}

export class BackendCredentialsRepo {
  constructor(
    private readonly db: DB,
    private readonly opts: RepoOpts,
  ) {}

  /**
   * Insert or replace a credential field. Encrypts before write. Resets
   * `status` to `untested` (the caller is expected to call `setStatus` after a
   * successful test handshake).
   */
  upsert(input: { backendId: string; fieldName: string; value: string }): void {
    const { iv, ciphertext } = encrypt(this.opts.masterKey, this.opts.profileId, input.value);
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO backend_credentials (id, profile_id, backend_id, field_name, value_encrypted, iv, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'untested', ?, ?)
         ON CONFLICT(profile_id, backend_id, field_name) DO UPDATE SET
           value_encrypted = excluded.value_encrypted,
           iv = excluded.iv,
           status = 'untested',
           updated_at = excluded.updated_at`,
      )
      .run(
        randomUUID(),
        this.opts.profileId,
        input.backendId,
        input.fieldName,
        ciphertext,
        iv,
        now,
        now,
      );
  }

  /** Returns the decrypted value, or `null` if no row exists. */
  getValue(backendId: string, fieldName: string): string | null {
    const row = this.db
      .prepare(
        `SELECT value_encrypted, iv FROM backend_credentials
         WHERE profile_id = ? AND backend_id = ? AND field_name = ?`,
      )
      .get(this.opts.profileId, backendId, fieldName) as
      | { value_encrypted: Buffer; iv: Buffer }
      | undefined;
    if (!row) return null;
    return decrypt(this.opts.masterKey, this.opts.profileId, row.iv, row.value_encrypted);
  }

  setStatus(backendId: string, status: BackendStatus, lastTestedAt: number | null): void {
    this.db
      .prepare(
        `UPDATE backend_credentials
         SET status = ?, last_tested_at = ?, updated_at = ?
         WHERE profile_id = ? AND backend_id = ?`,
      )
      .run(status, lastTestedAt, Date.now(), this.opts.profileId, backendId);
  }

  /** Records the timestamp of the last `auth_expired` Slack DM (24h debounce). */
  setAuthAlertAt(backendId: string, ts: number | null): void {
    this.db
      .prepare(
        `UPDATE backend_credentials
         SET last_auth_alert_at = ?, updated_at = ?
         WHERE profile_id = ? AND backend_id = ?`,
      )
      .run(ts, Date.now(), this.opts.profileId, backendId);
  }

  /**
   * Returns one entry per backend_id (collapses field-level rows up to the
   * backend level). Used by the dashboard to render status pills + the worker
   * to skip-or-execute crons.
   */
  listStatuses(): BackendCredentialStatus[] {
    const rows = this.db
      .prepare(
        `SELECT backend_id, MAX(status) AS status,
                MAX(last_tested_at) AS last_tested_at,
                MAX(last_auth_alert_at) AS last_auth_alert_at
         FROM backend_credentials
         WHERE profile_id = ?
         GROUP BY backend_id`,
      )
      .all(this.opts.profileId) as Array<{
      backend_id: string;
      status: BackendStatus;
      last_tested_at: number | null;
      last_auth_alert_at: number | null;
    }>;
    return rows.map((r) => ({
      backendId: r.backend_id,
      status: r.status,
      lastTestedAt: r.last_tested_at,
      lastAuthAlertAt: r.last_auth_alert_at,
    }));
  }

  delete(backendId: string): void {
    this.db
      .prepare(`DELETE FROM backend_credentials WHERE profile_id = ? AND backend_id = ?`)
      .run(this.opts.profileId, backendId);
  }

  /**
   * Latest `updated_at` across all rows for this profile. Used by the
   * credentials watcher to detect changes and re-materialize the SDK
   * credentials file. `null` when no row exists.
   */
  latestUpdatedAt(): number | null {
    const row = this.db
      .prepare(`SELECT MAX(updated_at) AS ts FROM backend_credentials WHERE profile_id = ?`)
      .get(this.opts.profileId) as { ts: number | null };
    return row.ts;
  }
}
