import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface CliState {
  profile?: string;
}

function statePath(home: string): string {
  return join(home, 'apps', 'cli', '.state.json');
}

export function readState(home: string): CliState {
  const path = statePath(home);
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as CliState;
    }
    return {};
  } catch {
    return {};
  }
}

export function writeState(home: string, state: CliState): void {
  const path = statePath(home);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}
