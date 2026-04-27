import { randomUUID } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { CommandRepo } from '@zeno/storage';
import { Hono } from 'hono';

const TRACKED_FILES = ['SOUL.md', 'USER.md', 'crons.yaml'] as const;

export interface SettingsRouteDeps {
  commands: CommandRepo;
  profileDir: string;
}

interface ProfileFile {
  path: string;
  bytes: number;
  mtime: string;
}

function readProfileFiles(profileDir: string): ProfileFile[] {
  const out: ProfileFile[] = [];
  for (const name of TRACKED_FILES) {
    const abs = join(profileDir, name);
    if (!existsSync(abs)) continue;
    const stat = statSync(abs);
    out.push({ path: name, bytes: stat.size, mtime: stat.mtime.toISOString() });
  }
  return out;
}

export function buildSettingsRoute(deps: SettingsRouteDeps): Hono {
  const route = new Hono();

  route.get('/', (c) => {
    const backendName = process.env.ZENO_BACKEND ?? 'claude-code';
    return c.json({
      backend: { name: backendName, selectedVia: 'ZENO_BACKEND env' },
      profileFiles: readProfileFiles(deps.profileDir),
    });
  });

  route.post('/restart', (c) => {
    deps.commands.enqueue({
      type: 'worker_restart',
      correlationId: randomUUID(),
    });
    return c.body(null, 204);
  });

  return route;
}
