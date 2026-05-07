// Mock state persistence. JSON file at ~/.zeno/preview-state.json.
// Same shape we'd model in the real spec's state.db (minus encryption).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { c, err } from './output.js';

export type ProfileStatus = 'running' | 'stopped' | 'failed';

export interface ProfileRow {
  port: number;
  status: ProfileStatus;
  createdAt: string;
  lastStartedAt: string | null;
  lastStoppedAt: string | null;
  masterKey: string;
}

export interface AuditEntry {
  ts: string;
  action: string;
  target: string | null;
  details: Record<string, unknown>;
}

export interface State {
  version: 1;
  currentProfile: string | null;
  currentVersion: string;
  imageBuilt: boolean;
  profiles: Record<string, ProfileRow>;
  auditLog: AuditEntry[];
}

const DEFAULT_VERSION = 'v2026.5.7';

const ZENO_HOME = join(homedir(), '.zeno');
const STATE_FILE = process.env.ZENO_PREVIEW_STATE ?? join(ZENO_HOME, 'preview-state.json');

export function statePath(): string {
  return STATE_FILE;
}

export function load(): State {
  if (!existsSync(STATE_FILE)) {
    return {
      version: 1,
      currentProfile: null,
      currentVersion: DEFAULT_VERSION,
      imageBuilt: false,
      profiles: {},
      auditLog: [],
    };
  }
  try {
    const raw = readFileSync(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as State;
    if (parsed.version !== 1) {
      console.error(err(`unsupported state version: ${parsed.version}`));
      console.error(c.gray(`  state file: ${STATE_FILE}`));
      process.exit(2);
    }
    parsed.imageBuilt = parsed.imageBuilt ?? false;
    parsed.currentVersion = parsed.currentVersion ?? DEFAULT_VERSION;
    return parsed;
  } catch (e) {
    console.error(err(`corrupt state file: ${STATE_FILE}`));
    console.error(c.gray(`  ${(e as Error).message}`));
    process.exit(2);
  }
}

export function save(state: State): void {
  const dir = dirname(STATE_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

export function audit(
  state: State,
  action: string,
  target: string | null,
  details: Record<string, unknown> = {},
): void {
  state.auditLog.push({
    ts: new Date().toISOString(),
    action,
    target,
    details,
  });
}

export function reset(): void {
  save({
    version: 1,
    currentProfile: null,
    currentVersion: DEFAULT_VERSION,
    imageBuilt: false,
    profiles: {},
    auditLog: [],
  });
}
