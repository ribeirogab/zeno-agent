/**
 * Spec 0072 — `zeno backend test [slug]` — live ping against the backend's
 * provider API. Decrypts the stored token via the runtime DB repo, calls
 * `testClaudeToken` (shared helper from @zeno/backends) directly against
 * api.anthropic.com, then writes the result back to the DB.
 */

import { type ClaudeTestResult, loadBackendsCatalog, testClaudeToken } from '@zeno/backends';
import { defineCommand } from 'citty';
import { c, err, isQuiet, ok, setQuiet } from '../lib/output.js';
import { resolveProfile } from '../lib/resolvers.js';
import { openProfileRuntimeDb } from '../lib/runtime-db.js';

export function mapTestResultToExit(r: ClaudeTestResult): number {
  if (r.kind === 'ok') return 0;
  if (r.kind === 'unauthorized') return 1;
  if (r.kind === 'rate_limited') return 1;
  return 2;
}

export function mapTestResultToStatus(r: ClaudeTestResult): 'active' | 'expired' | 'untested' {
  if (r.kind === 'ok') return 'active';
  if (r.kind === 'unauthorized') return 'expired';
  return 'untested';
}

export default defineCommand({
  meta: {
    name: 'test',
    description: "test a backend's stored credentials by hitting its provider API",
  },
  args: {
    slug: { type: 'positional', description: 'backend slug', required: false },
    profile: { type: 'string', description: 'profile identifier' },
    json: { type: 'boolean', description: 'emit JSON' },
    quiet: { type: 'boolean', description: 'minimal output' },
  },
  async run({ args }) {
    if (args.quiet) setQuiet(true);
    const profile = await resolveProfile(args.profile as string | undefined, {
      ignoreSticky: true,
    });
    const handle = openProfileRuntimeDb({
      profile: profile.name,
      masterKeyHex: profile.masterKey,
    });
    try {
      const catalog = loadBackendsCatalog();
      const slug = (args.slug as string | undefined) ?? catalog.backends[0]?.id ?? 'claude-code';
      const backend = catalog.backends.find((b) => b.id === slug);
      if (!backend) {
        process.stderr.write(`${err(`backend '${slug}' not in catalog`)}\n`);
        process.exit(1);
      }
      const token = handle.backendCredentialsRepo.getValue(slug, 'oauth_token');
      if (!token) {
        process.stderr.write(
          `${err(`no credentials for '${slug}' in profile=${profile.name}. run: zeno backend configure`)}\n`,
        );
        process.exit(1);
      }
      const startMs = Date.now();
      const result = await testClaudeToken({ token, model: backend.test.model });
      const elapsed = Date.now() - startMs;
      const status = mapTestResultToStatus(result);
      handle.backendCredentialsRepo.setStatus(slug, status, Date.now());

      if (args.json) {
        process.stdout.write(
          `${JSON.stringify({
            slug,
            status,
            ms: elapsed,
            ts: new Date().toISOString(),
            kind: result.kind,
          })}\n`,
        );
      } else if (!isQuiet() || result.kind !== 'ok') {
        if (result.kind === 'ok') {
          console.log(ok(`${slug} · ${status} · ${elapsed}ms`));
        } else if (result.kind === 'unauthorized') {
          console.log(err(`${slug} · expired · run zeno backend rotate ${slug}`));
        } else if (result.kind === 'rate_limited') {
          console.log(err(`${slug} · rate-limited · retry later`));
        } else {
          console.log(err(`${slug} · network error · ${result.reason}`));
        }
      }
      process.exit(mapTestResultToExit(result));
    } finally {
      handle.close();
    }
    // unreachable but TS-friendly
    void c;
  },
});
