import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DB } from '@zeno/db/host';
import { queries } from '@zeno/db/host';
import { ZENO_HOME } from './paths.js';

export function readVersionFromPackage(): string {
  const path = join(ZENO_HOME, 'package.json');
  if (!existsSync(path)) return '0.0.0-dev';
  try {
    const pkg = JSON.parse(readFileSync(path, 'utf8')) as { version?: string };
    return pkg.version ?? '0.0.0-dev';
  } catch {
    return '0.0.0-dev';
  }
}

export function getCurrentVersion(db: DB): string {
  return queries.getVersion(db) ?? `v${readVersionFromPackage()}`;
}
