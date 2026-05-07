import { randomBytes } from 'node:crypto';
import type { DB, ProfileRow } from '@zeno/db/host';
import { queries } from '@zeno/db/host';
import { c, err } from './output.js';

export const NAME_RE = /^[a-z][a-z0-9-]{0,30}$/;
export const PORT_MIN = 6101;
export const PORT_MAX = 6200;

export function validateName(name: string): true | string {
  if (!NAME_RE.test(name)) {
    return `invalid name '${name}'. must match /^[a-z][a-z0-9-]{0,30}$/`;
  }
  return true;
}

export function nextAvailablePort(db: DB): number | null {
  const taken = new Set(queries.listProfiles(db).map((p) => p.port));
  for (let p = PORT_MIN; p <= PORT_MAX; p++) {
    if (!taken.has(p)) return p;
  }
  return null;
}

export function isPortTaken(db: DB, port: number, exceptName?: string): boolean {
  return queries.listProfiles(db).some((p) => p.port === port && p.name !== exceptName);
}

export function resolveName(db: DB, arg: string | undefined): string {
  if (arg) return arg;
  const sticky = queries.getSticky(db);
  if (sticky) return sticky;
  console.error(err('no profile specified and no sticky profile set'));
  console.error(c.gray('  set sticky: zeno profile use <profile>'));
  console.error(c.gray('  list:       zeno profile list'));
  process.exit(1);
}

export function requireProfile(db: DB, name: string): ProfileRow {
  const p = queries.findProfile(db, name);
  if (!p) {
    console.error(err(`profile '${name}' not found`));
    console.error(c.gray('  list: zeno profile list'));
    process.exit(1);
  }
  return p;
}

export function generateMasterKey(): string {
  return randomBytes(32).toString('hex');
}
