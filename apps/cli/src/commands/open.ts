import { spawn } from 'node:child_process';
import { defineCommand } from 'citty';

const URL = 'http://localhost:3000';

function platformOpener(): string {
  if (process.platform === 'darwin') return 'open';
  if (process.platform === 'win32') return 'start';
  if (process.env.WSL_DISTRO_NAME) return 'wslview';
  return 'xdg-open';
}

export default defineCommand({
  meta: { name: 'open', description: 'open dashboard in browser' },
  run() {
    const child = spawn(platformOpener(), [URL], { stdio: 'inherit' });
    child.on('exit', (code) => {
      process.exit(code ?? 1);
    });
    child.on('error', (err) => {
      console.error(`error: failed to open browser: ${err.message}`);
      console.error(`       open ${URL} manually`);
      process.exit(1);
    });
  },
});
