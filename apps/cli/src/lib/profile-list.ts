import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const COMPOSE_RE = /^docker-compose\.([^.]+)\.yml$/;

export function listProfiles(home: string): string[] {
  const dir = join(home, 'infra');
  if (!existsSync(dir)) return [];
  const names: string[] = [];
  for (const file of readdirSync(dir)) {
    const match = COMPOSE_RE.exec(file);
    if (match?.[1]) names.push(match[1]);
  }
  return names.sort();
}
