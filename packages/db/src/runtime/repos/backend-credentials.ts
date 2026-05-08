import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { decrypt, encrypt } from '../crypto.js';
import type { RuntimeDB } from '../db.js';
import { backendCredentials } from '../schema.js';

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
    private readonly db: RuntimeDB,
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
      .insert(backendCredentials)
      .values({
        id: randomUUID(),
        profileId: this.opts.profileId,
        backendId: input.backendId,
        fieldName: input.fieldName,
        valueEncrypted: ciphertext,
        iv,
        status: 'untested',
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          backendCredentials.profileId,
          backendCredentials.backendId,
          backendCredentials.fieldName,
        ],
        set: {
          valueEncrypted: ciphertext,
          iv,
          status: 'untested',
          updatedAt: now,
        },
      })
      .run();
  }

  /** Returns the decrypted value, or `null` if no row exists. */
  getValue(backendId: string, fieldName: string): string | null {
    const row = this.db
      .select({
        valueEncrypted: backendCredentials.valueEncrypted,
        iv: backendCredentials.iv,
      })
      .from(backendCredentials)
      .where(
        and(
          eq(backendCredentials.profileId, this.opts.profileId),
          eq(backendCredentials.backendId, backendId),
          eq(backendCredentials.fieldName, fieldName),
        ),
      )
      .get();
    if (!row) return null;
    return decrypt(this.opts.masterKey, this.opts.profileId, row.iv, row.valueEncrypted);
  }

  setStatus(backendId: string, status: BackendStatus, lastTestedAt: number | null): void {
    this.db
      .update(backendCredentials)
      .set({
        status,
        lastTestedAt,
        updatedAt: Date.now(),
      })
      .where(
        and(
          eq(backendCredentials.profileId, this.opts.profileId),
          eq(backendCredentials.backendId, backendId),
        ),
      )
      .run();
  }

  /** Records the timestamp of the last `auth_expired` Slack DM (24h debounce). */
  setAuthAlertAt(backendId: string, ts: number | null): void {
    this.db
      .update(backendCredentials)
      .set({
        lastAuthAlertAt: ts,
        updatedAt: Date.now(),
      })
      .where(
        and(
          eq(backendCredentials.profileId, this.opts.profileId),
          eq(backendCredentials.backendId, backendId),
        ),
      )
      .run();
  }

  /**
   * Returns one entry per backend_id (collapses field-level rows up to the
   * backend level). Used by the dashboard to render status pills + the worker
   * to skip-or-execute crons.
   */
  listStatuses(): BackendCredentialStatus[] {
    const rows = this.db.all<{
      backend_id: string;
      status: BackendStatus;
      last_tested_at: number | null;
      last_auth_alert_at: number | null;
    }>(sql`
      SELECT backend_id, MAX(status) AS status,
             MAX(last_tested_at) AS last_tested_at,
             MAX(last_auth_alert_at) AS last_auth_alert_at
      FROM ${backendCredentials}
      WHERE profile_id = ${this.opts.profileId}
      GROUP BY backend_id
    `);
    return rows.map((r) => ({
      backendId: r.backend_id,
      status: r.status,
      lastTestedAt: r.last_tested_at,
      lastAuthAlertAt: r.last_auth_alert_at,
    }));
  }

  delete(backendId: string): void {
    this.db
      .delete(backendCredentials)
      .where(
        and(
          eq(backendCredentials.profileId, this.opts.profileId),
          eq(backendCredentials.backendId, backendId),
        ),
      )
      .run();
  }

  /**
   * Latest `updated_at` across all rows for this profile. Used by the
   * credentials watcher to detect changes and re-materialize the SDK
   * credentials file. `null` when no row exists.
   */
  latestUpdatedAt(): number | null {
    const row = this.db.get<{ ts: number | null }>(sql`
      SELECT MAX(updated_at) AS ts FROM ${backendCredentials}
      WHERE profile_id = ${this.opts.profileId}
    `);
    return row?.ts ?? null;
  }
}
