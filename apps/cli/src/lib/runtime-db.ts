/**
 * Spec 0072 — open the runtime DB for a profile from the host.
 *
 * The runtime DB lives at `<workspaceBindPath>/zeno.db` (a host bind mount
 * shared with the profile container — see paths.ts). The CLI opens it
 * directly to read/write `backend_credentials` + `backend_settings` without
 * going through docker exec or the api HTTP surface.
 *
 * Master key + profile id come from the host DB (`@zeno/db/host` profile
 * record); the runtime repos receive both via `RepoOpts` and decrypt in
 * process.
 */

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  BackendCredentialsRepo,
  BackendSettingsRepo,
  openRuntimeDatabase,
  runRuntimeMigrations,
} from '@zeno/db/runtime';
import { profileRuntimeDbPath, workspaceBindPath } from './paths.js';

export interface ProfileRuntimeDbOpts {
  /** Profile name — also used as the repo `profileId`. */
  profile: string;
  /** Hex-encoded master key from the host DB profile record (64 chars). */
  masterKeyHex: string;
  /**
   * Optional override for the runtime DB path. Defaults to
   * `profileRuntimeDbPath(profile)`. Tests pass an isolated path here.
   */
  dbPath?: string;
}

export interface ProfileRuntimeDbHandle {
  backendCredentialsRepo: BackendCredentialsRepo;
  backendSettingsRepo: BackendSettingsRepo;
  close(): void;
}

export function openProfileRuntimeDb(opts: ProfileRuntimeDbOpts): ProfileRuntimeDbHandle {
  const masterKey = Buffer.from(opts.masterKeyHex, 'hex');
  if (masterKey.length !== 32) {
    throw new Error(
      `master key for profile '${opts.profile}' is malformed: expected 32 bytes, got ${masterKey.length}`,
    );
  }

  const dbPath = opts.dbPath ?? profileRuntimeDbPath(opts.profile);
  // Defensive — first-touch CLI commands (e.g. `zeno backend list` before
  // first start) should not crash on a missing dir.
  if (!opts.dbPath) {
    mkdirSync(workspaceBindPath(opts.profile), { recursive: true });
  }
  mkdirSync(dirname(dbPath), { recursive: true });

  const opened = openRuntimeDatabase(dbPath);
  runRuntimeMigrations(opened.raw);

  const backendCredentialsRepo = new BackendCredentialsRepo(opened.drizzle, {
    masterKey,
    profileId: opts.profile,
  });
  const backendSettingsRepo = new BackendSettingsRepo(opened.drizzle, opts.profile);

  return {
    backendCredentialsRepo,
    backendSettingsRepo,
    close: () => opened.close(),
  };
}
