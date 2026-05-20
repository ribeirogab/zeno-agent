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

export function profileAgentsMd(name: string): string {
  return join(profileDir(name), 'AGENTS.md');
}

export function templatesProfileDir(): string {
  return join(ZENO_HOME, 'templates', 'profile');
}

export function agentMountSource(): string {
  return join(ZENO_HOME, 'agent');
}

/**
 * Spec 0072 — workspace dir is a bind mount on the host so the CLI can open
 * the runtime DB (`<workspaceBindPath>/zeno.db`) directly via
 * `openRuntimeDatabase` without going through docker exec. Replaces the
 * named volume `workspaceVolumeName` from spec 0050.
 */
export function workspaceBindPath(profile: string): string {
  return join(profileDir(profile), 'workspace');
}

export function profileRuntimeDbPath(profile: string): string {
  return join(workspaceBindPath(profile), 'zeno.db');
}

export function claudeHomeVolumeName(profile: string): string {
  return `zeno-${profile}-claude-home`;
}

export function containerName(profile: string): string {
  return `zeno-${profile}`;
}
