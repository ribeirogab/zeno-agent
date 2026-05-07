// Read templates/profile/* and substitute placeholders into a freshly-created
// profile dir under ~/.zeno/profiles/<name>/.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { profileDir, templatesProfileDir } from './paths.js';

export function readUserTemplate(): string {
  return readFileSync(join(templatesProfileDir(), 'USER.md'), 'utf8');
}

export function readEnvTemplate(): string {
  return readFileSync(join(templatesProfileDir(), 'env.template'), 'utf8');
}

export function renderUserMd(opts: { name: string; timezone: string }): string {
  return readUserTemplate()
    .replace(/<your-name>/g, opts.name)
    .replace(/<auto-detected-tz>/g, opts.timezone);
}

export function renderEnv(opts: { masterKey: string }): string {
  return readEnvTemplate().replace(/<generated>/g, opts.masterKey);
}

/**
 * Materialize a fresh profile directory at ~/.zeno/profiles/<profile>/ with
 * USER.md and .env rendered from the canonical templates.
 */
export function materializeProfile(opts: {
  profile: string;
  ownerName: string;
  timezone: string;
  masterKey: string;
}): void {
  const dir = profileDir(opts.profile);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'USER.md'),
    renderUserMd({ name: opts.ownerName, timezone: opts.timezone }),
    'utf8',
  );
  writeFileSync(join(dir, '.env'), renderEnv({ masterKey: opts.masterKey }), 'utf8');
}

/**
 * Best-effort host timezone detection. Falls back to 'UTC' if the platform
 * doesn't expose a sensible IANA name.
 */
export function detectTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && tz !== 'Etc/Unknown' ? tz : 'UTC';
  } catch {
    return 'UTC';
  }
}
