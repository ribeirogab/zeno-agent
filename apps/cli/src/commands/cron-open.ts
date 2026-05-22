/**
 * Spec 2026-05-22 — `zeno cron open [slug]` — open crons folder (or one cron's
 * subfolder) in the OS file browser. Mirrors `zeno knowledge open`.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { defineCommand } from 'citty';
import { validateSlug } from '../lib/cron-frontmatter.js';
import { err as errStr, setQuiet } from '../lib/output.js';
import { cronDir, cronsDir } from '../lib/paths.js';
import { requireProfile } from '../lib/profile.js';
import { resolveProfile } from '../lib/resolvers.js';
import { db } from '../lib/state.js';

export default defineCommand({
  meta: {
    name: 'open',
    description: 'open the profile crons folder (or a cron) in the OS file browser',
  },
  args: {
    slug: { type: 'positional', description: 'cron slug (optional)', required: false },
    profile: { type: 'string', description: 'profile name', required: false },
    quiet: { type: 'boolean', description: 'minimal output' },
  },
  async run({ args }) {
    if (args.quiet) setQuiet(true);
    const conn = db();
    const { name: profile } = await resolveProfile(args.profile as string | undefined, {
      ignoreSticky: true,
    });
    requireProfile(conn, profile);

    let dir = cronsDir(profile);
    if (args.slug) {
      const slug = String(args.slug);
      const slugCheck = validateSlug(slug);
      if (!slugCheck.ok) {
        console.error(errStr(slugCheck.reason));
        process.exit(1);
      }
      dir = cronDir(profile, slug);
    }

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
      console.error(errStr(`unsupported platform: ${process.platform}`));
      process.exit(1);
    }

    spawn(cmd, [dir], { detached: true, stdio: 'ignore' }).unref();
  },
});
