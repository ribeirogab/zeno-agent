/**
 * Spec 0072 — `zeno backend configure` — interactive OAuth flow.
 *
 * Resolves the profile, verifies its container is running, picks a backend
 * (claude-code only today; codex hard-blocked), runs `claude setup-token`
 * inside the container via dockerode.exec PTY, captures the OAuth token
 * from stdout, encrypts + stores in the runtime DB, then runs a test ping
 * against the live Anthropic API.
 *
 * No --token flag — auth flow is driver-specific (each future driver
 * defines its own auth surface). CI use cases not supported in F1.
 */

import { loadBackendsCatalog, testClaudeToken } from '@zeno/backends';
import { defineCommand } from 'citty';
import Docker from 'dockerode';
import { resolveBackend } from '../lib/backend-resolver.js';
import { runClaudeOAuth } from '../lib/claude-oauth.js';
import { c, err, isQuiet, ok, setQuiet } from '../lib/output.js';
import { containerName } from '../lib/paths.js';
import { promptHidden } from '../lib/prompt.js';
import { resolveProfile } from '../lib/resolvers.js';
import { openProfileRuntimeDb } from '../lib/runtime-db.js';

export function assertContainerRunning(profileName: string, state: string): void {
  if (state !== 'running') {
    throw new Error(
      `profile '${profileName}' container not running. start it first: zeno start ${profileName}`,
    );
  }
}

interface InspectShape {
  State: { Status: string };
}

async function fetchContainerState(docker: Docker, profileName: string): Promise<InspectShape> {
  try {
    return (await docker.getContainer(containerName(profileName)).inspect()) as InspectShape;
  } catch (e) {
    const errCode = (e as { statusCode?: number }).statusCode;
    if (errCode === 404) {
      throw new Error(
        `profile '${profileName}' container not running. start it first: zeno start ${profileName}`,
      );
    }
    throw e;
  }
}

export default defineCommand({
  meta: {
    name: 'configure',
    description:
      'configure a backend (interactive OAuth flow inside the profile container)',
  },
  args: {
    profile: { type: 'string', description: 'profile identifier (omit for sticky/picker)' },
    quiet: { type: 'boolean', description: 'minimal output' },
  },
  async run({ args }) {
    if (args.quiet) setQuiet(true);
    const profile = await resolveProfile(args.profile as string | undefined);

    const docker = new Docker();
    const inspected = await fetchContainerState(docker, profile.name);
    try {
      assertContainerRunning(profile.name, inspected.State.Status);
    } catch (e) {
      process.stderr.write(`${err((e as Error).message)}\n`);
      process.exit(1);
    }

    const catalog = loadBackendsCatalog();
    const backend = await resolveBackend(undefined, catalog);
    const catalogEntry = catalog.backends.find((b) => b.id === backend.id);
    if (!catalogEntry) {
      process.stderr.write(`${err(`backend '${backend.id}' missing from catalog (race?)`)}\n`);
      process.exit(1);
    }

    if (!isQuiet()) {
      process.stdout.write(c.dim(`\n─ ${backend.name} oauth (in ${profile.name} container) ─\n\n`));
    }

    const container = docker.getContainer(containerName(profile.name));
    let token: string;
    try {
      token = await runClaudeOAuth({
        container,
        backend: catalogEntry as never,
        promptCode: async (url) => {
          process.stdout.write(`\nopen this URL in your browser:\n  ${c.cyan(url)}\n\n`);
          const code = await promptHidden('paste code from browser: ');
          return code.trim();
        },
      });
    } catch (e) {
      process.stderr.write(`${err((e as Error).message)}\n`);
      process.exit(1);
    }

    const handle = openProfileRuntimeDb({
      profile: profile.name,
      masterKeyHex: profile.masterKey,
    });
    try {
      handle.backendCredentialsRepo.upsert({
        backendId: backend.id,
        fieldName: 'oauth_token',
        value: token,
      });
      const startMs = Date.now();
      const result = await testClaudeToken({ token, model: catalogEntry.test.model });
      const elapsed = Date.now() - startMs;
      if (result.kind === 'ok') {
        handle.backendCredentialsRepo.setStatus(backend.id, 'active', Date.now());
        console.log(ok(`${backend.id} · active · ${elapsed}ms`));
        process.exit(0);
      }
      if (result.kind === 'unauthorized') {
        handle.backendCredentialsRepo.setStatus(backend.id, 'expired', Date.now());
        process.stderr.write(`${err(`${backend.id} · token rejected by anthropic (401)`)}\n`);
        process.exit(1);
      }
      handle.backendCredentialsRepo.setStatus(backend.id, 'untested', Date.now());
      process.stderr.write(`${err(`${backend.id} · network error during verification`)}\n`);
      process.exit(2);
    } finally {
      handle.close();
    }
  },
});
