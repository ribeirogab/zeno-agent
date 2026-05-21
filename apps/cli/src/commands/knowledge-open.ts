import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { defineCommand } from 'citty';
import { err, setQuiet } from '../lib/output.js';
import { knowledgeDir } from '../lib/paths.js';
import { requireProfile } from '../lib/profile.js';
import { resolveProfile } from '../lib/resolvers.js';
import { db } from '../lib/state.js';

export default defineCommand({
  meta: { name: 'open', description: 'open the profile knowledge folder in the OS file browser' },
  args: {
    profile: { type: 'positional', description: 'profile identifier', required: false },
    quiet: { type: 'boolean', description: 'minimal output' },
  },
  async run({ args }) {
    if (args.quiet) setQuiet(true);
    const conn = db();
    const { name } = await resolveProfile(args.profile as string | undefined, {
      ignoreSticky: true,
    });
    requireProfile(conn, name);

    const dir = knowledgeDir(name);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const cmd =
      process.platform === 'darwin'
        ? 'open'
        : process.platform === 'win32'
          ? 'explorer'
          : process.platform === 'linux'
            ? 'xdg-open'
            : null;

    if (cmd === null) {
      console.error(err(`unsupported platform: ${process.platform}`));
      process.exit(1);
    }

    spawn(cmd, [dir], { detached: true, stdio: 'ignore' }).unref();
  },
});
