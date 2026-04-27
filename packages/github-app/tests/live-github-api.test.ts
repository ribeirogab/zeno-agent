/**
 * @live tests — hit real GitHub API. Skipped unless `LIVE_TESTS=1` and the
 * legacy PEM exists at `tmp/legacy-github-app/github-app.pem`. The PEM is
 * gitignored.
 *
 * Run manually:
 *   LIVE_TESTS=1 pnpm --filter @zeno/github-app test live
 *
 * Spec 0044 — gives us a contract canary against GitHub API breaking changes.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  fetchAppMetadata,
  fetchInstallations,
  mintInstallationToken,
  signAppJwt,
} from '../src/index.js';

const LIVE = process.env.LIVE_TESTS === '1';
// Walk up from this test file to repo root, then into tmp/.
const PEM_PATH = resolve(import.meta.dirname, '../../../tmp/legacy-github-app/github-app.pem');
// The legacy app id, hardcoded in the original yaml. If the operator rotated
// to a different App, override via env. Spec 0042/0044.
const APP_ID = process.env.LIVE_GITHUB_APP_ID ?? '12345';

const skipMsg = !LIVE
  ? 'LIVE_TESTS=1 not set; skipping'
  : !existsSync(PEM_PATH)
    ? `PEM not found at ${PEM_PATH}; skipping`
    : null;

describe.skipIf(skipMsg !== null)('@live GitHub API', () => {
  if (skipMsg) console.warn(skipMsg);
  const pem = LIVE && existsSync(PEM_PATH) ? readFileSync(PEM_PATH, 'utf8') : '';

  it('signs a JWT and fetches the App metadata', async () => {
    const jwt = signAppJwt({ appId: APP_ID, privateKey: pem });
    const meta = await fetchAppMetadata(jwt);
    expect(meta.appId).toBe(APP_ID);
    expect(meta.slug).toMatch(/^[a-z0-9-]+$/);
    expect(meta.name.length).toBeGreaterThan(0);
  });

  it('lists installations and mints a token for the first one', async () => {
    const jwt = signAppJwt({ appId: APP_ID, privateKey: pem });
    const installs = await fetchInstallations(jwt);
    expect(installs.length).toBeGreaterThan(0);
    const first = installs[0];
    if (!first) throw new Error('no installations');
    const tok = await mintInstallationToken(jwt, first.id);
    expect(tok.token).toMatch(/^ghs_/);
    expect(new Date(tok.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });
});
