import { spawn } from 'node:child_process';
import { defineCommand } from 'citty';
import { resolveZenoHome } from '../lib/zeno-home.js';

function run(cmd: string, args: string[], cwd: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', cwd });
    child.on('exit', (code) => {
      resolve(code ?? 1);
    });
    child.on('error', reject);
  });
}

export default defineCommand({
  meta: { name: 'update', description: 'git pull + rebuild' },
  async run() {
    const home = resolveZenoHome();
    const steps: Array<[string, string[]]> = [
      ['git', ['pull', '--ff-only']],
      ['pnpm', ['install', '--frozen-lockfile']],
      ['pnpm', ['build', '--filter', '@zeno/cli']],
    ];
    for (const [cmd, args] of steps) {
      const code = await run(cmd, args, home);
      if (code !== 0) {
        console.error(`error: '${cmd} ${args.join(' ')}' exited ${code}`);
        process.exit(code);
      }
    }
    console.log('zeno updated');
  },
});
