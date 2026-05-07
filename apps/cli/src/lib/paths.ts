import { homedir } from 'node:os';
import { join } from 'node:path';

export const ZENO_DATA = join(homedir(), '.zeno');
export const ZENO_HOME = join(ZENO_DATA, 'zeno-agent');
export const STATE_DB_PATH = join(ZENO_DATA, 'state.db');

export function profileDir(name: string): string {
  return join(ZENO_DATA, 'profiles', name);
}

export function profileEnvFile(name: string): string {
  return join(profileDir(name), '.env');
}

export function profileUserMd(name: string): string {
  return join(profileDir(name), 'USER.md');
}

export function templatesProfileDir(): string {
  return join(ZENO_HOME, 'templates', 'profile');
}

export function agentMountSource(): string {
  return join(ZENO_HOME, 'agent');
}

export function workspaceVolumeName(profile: string): string {
  return `zeno-${profile}-workspace`;
}

export function claudeHomeVolumeName(profile: string): string {
  return `zeno-${profile}-claude-home`;
}

export function containerName(profile: string): string {
  return `zeno-${profile}`;
}
