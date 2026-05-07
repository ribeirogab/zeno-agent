import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function composeArgs(home: string, profile: string): string[] {
  return ['-f', `infra/docker-compose.${profile}.yml`, '--project-directory', home];
}

export function composeFileExists(home: string, profile: string): boolean {
  return existsSync(join(home, 'infra', `docker-compose.${profile}.yml`));
}

export function runCompose(home: string, profile: string, args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['compose', ...composeArgs(home, profile), ...args], {
      stdio: 'inherit',
      cwd: home,
    });
    child.on('exit', (code, signal) => {
      if (code !== null) {
        resolve(code);
        return;
      }
      if (signal !== null) {
        const offset = signalNumber(signal);
        resolve(typeof offset === 'number' ? 128 + offset : 1);
        return;
      }
      resolve(1);
    });
    child.on('error', reject);
  });
}

function signalNumber(signal: NodeJS.Signals): number | undefined {
  const map: Record<string, number> = {
    SIGINT: 2,
    SIGTERM: 15,
    SIGKILL: 9,
    SIGHUP: 1,
    SIGQUIT: 3,
  };
  return map[signal];
}
