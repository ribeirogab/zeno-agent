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
  /** Profile name — used to derive the bind path and as the repo `profileId`. */
  profile: string;
  /** Hex-encoded master key from the host DB profile record (64 chars). */
  masterKeyHex: string;
}

export interface ProfileRuntimeDbHandle {
  backendCredentialsRepo: BackendCredentialsRepo;
  backendSettingsRepo: BackendSettingsRepo;
  close(): void;
}

/**
 * Open the runtime DB for a profile. Creates the workspace bind dir if
 * missing (idempotent — the same dir is created by `zeno start`). Runs
 * runtime migrations on first open so a fresh profile (no container ever
 * started) still gets a usable schema.
 *
 * Throws if the master key is malformed.
 */
export function openProfileRuntimeDb(opts: ProfileRuntimeDbOpts): ProfileRuntimeDbHandle {
  const masterKey = Buffer.from(opts.masterKeyHex, 'hex');
  if (masterKey.length !== 32) {
    throw new Error(
      `master key for profile '${opts.profile}' is malformed: expected 32 bytes, got ${masterKey.length}`,
    );
  }

  const dbPath = profileRuntimeDbPath(opts.profile);
  // Defensive — the bind dir is also created by `zeno start`, but tests and
  // first-touch CLI commands (e.g. `zeno backend list` before first start)
  // should not crash on a missing dir.
  mkdirSync(workspaceBindPath(opts.profile), { recursive: true });
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
