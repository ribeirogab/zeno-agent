// Read templates/profile/* and write a freshly-created profile dir
// under ~/.zeno/profiles/<name>/.
//
// Spec 2026-05-20 (agents-md-per-instance): the per-profile manual is
// AGENTS.md, written verbatim from templates/profile/AGENTS.md. No
// placeholder substitution — the template is static; the operator
// fills in their own rules.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { profileDir, templatesProfileDir } from './paths.js';

export function readAgentsTemplate(): string {
  return readFileSync(join(templatesProfileDir(), 'AGENTS.md'), 'utf8');
}

export function readEnvTemplate(): string {
  return readFileSync(join(templatesProfileDir(), 'env.template'), 'utf8');
}

export function renderEnv(opts: { masterKey: string }): string {
  return readEnvTemplate().replace(/<generated>/g, opts.masterKey);
}

/**
 * Materialize a fresh profile directory at ~/.zeno/profiles/<profile>/ with
 * AGENTS.md and .env written from the canonical templates.
 */
export function materializeProfile(opts: {
  profile: string;
  masterKey: string;
}): void {
  const dir = profileDir(opts.profile);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'AGENTS.md'), readAgentsTemplate(), 'utf8');
  writeFileSync(join(dir, '.env'), renderEnv({ masterKey: opts.masterKey }), 'utf8');
}
