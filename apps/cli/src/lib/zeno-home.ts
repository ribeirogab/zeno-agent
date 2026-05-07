import { homedir } from 'node:os';
import { join } from 'node:path';

export function resolveZenoHome(): string {
  return process.env.ZENO_HOME ?? join(homedir(), 'zeno-agent');
}
