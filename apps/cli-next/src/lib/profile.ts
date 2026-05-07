// Profile resolution + validation helpers.

import { c, err } from './output.js';
import type { ProfileRow, State } from './state.js';

export const NAME_RE = /^[a-z][a-z0-9-]{0,30}$/;
export const PORT_MIN = 6101;
export const PORT_MAX = 6200;

export function validateName(name: string): true | string {
  if (!NAME_RE.test(name)) {
    return `invalid name '${name}'. must match /^[a-z][a-z0-9-]{0,30}$/`;
  }
  return true;
}

export function nextAvailablePort(state: State): number | null {
  const taken = new Set(Object.values(state.profiles).map((p) => p.port));
  for (let p = PORT_MIN; p <= PORT_MAX; p++) {
    if (!taken.has(p)) return p;
  }
  return null;
}

export function isPortTaken(state: State, port: number, exceptName?: string): boolean {
  return Object.entries(state.profiles).some(([n, p]) => p.port === port && n !== exceptName);
}

export function resolveName(state: State, arg: string | undefined): string {
  if (arg) return arg;
  if (state.currentProfile) return state.currentProfile;
  console.error(err('no profile specified and no sticky profile set'));
  console.error(c.gray('  set sticky: zeno-next profile use <name>'));
  console.error(c.gray('  list:       zeno-next profile list'));
  process.exit(1);
}

export function requireProfile(state: State, name: string): ProfileRow {
  const p = state.profiles[name];
  if (!p) {
    console.error(err(`profile '${name}' not found`));
    console.error(c.gray('  list: zeno-next profile list'));
    process.exit(1);
  }
  return p;
}

export function generateMasterKey(): string {
  // deterministic-feeling fake. Real impl uses crypto.randomBytes(32).hex.
  const chars = 'abcdef0123456789';
  let out = '';
  for (let i = 0; i < 64; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
