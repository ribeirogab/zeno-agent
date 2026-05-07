// Version resolver. Reads root package.json relative to the binary location.
// Falls back to a fixed string if the file isn't present (bundled binary in odd location).

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function readVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    // walk up to find a package.json with `version`
    let dir = here;
    for (let i = 0; i < 6; i++) {
      const candidate = join(dir, 'package.json');
      if (existsSync(candidate)) {
        const pkg = JSON.parse(readFileSync(candidate, 'utf8')) as { version?: string };
        if (pkg.version && pkg.version !== '0.0.0') return `${pkg.version}-preview`;
      }
      dir = dirname(dir);
    }
  } catch {
    /* fall through */
  }
  return '2026.5.7-preview';
}
