import { spawn } from 'node:child_process';
import { defineCommand } from 'citty';
import { c, err, setQuiet } from '../lib/output.js';
import { resolveProfile } from '../lib/resolvers.js';

function platformOpener(): string {
  if (process.env.WSL_DISTRO_NAME) return 'wslview';
  if (process.platform === 'darwin') return 'open';
  if (process.platform === 'win32') return 'start';
  return 'xdg-open';
}

export default defineCommand({
  meta: { name: 'open', description: 'open the profile dashboard in your browser' },
  args: {
    profile: {
      type: 'positional',
      description: 'profile identifier (omit for sticky)',
      required: false,
    },
    quiet: { type: 'boolean', description: 'minimal output' },
  },
  async run({ args }) {
    if (args.quiet) setQuiet(true);
    const p = await resolveProfile(args.profile as string | undefined);
    const url = `http://localhost:${p.port}`;
    const child = spawn(platformOpener(), [url], { stdio: 'inherit' });
    child.on('exit', (code) => process.exit(code ?? 1));
    child.on('error', (e) => {
      console.error(err(`failed to open browser: ${e.message}`));
      console.error(c.gray(`  open ${url} manually`));
      process.exit(1);
    });
  },
});
