/**
 * Spec 2026-05-22 — `zeno cron delete <slug> [--yes]` — remove the cron folder.
 *
 * TTY prompt unless --yes. Non-TTY without --yes exits 1.
 * Reconciler clears the DB row + cron_runs within 4s.
 */

import { existsSync, rmSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { defineCommand } from 'citty';
import { validateSlug } from '../lib/cron-frontmatter.js';
import { c, err as errStr, ok as okStr, setQuiet } from '../lib/output.js';
import { cronDir } from '../lib/paths.js';
import { requireProfile } from '../lib/profile.js';
import { resolveProfile } from '../lib/resolvers.js';
import { db } from '../lib/state.js';

async function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

export default defineCommand({
  meta: { name: 'delete', description: 'remove the cron folder + run history' },
  args: {
    slug: { type: 'positional', description: 'cron slug', required: true },
    yes: { type: 'boolean', description: 'skip confirmation (required in non-TTY)' },
    profile: { type: 'string', description: 'profile name', required: false },
    quiet: { type: 'boolean', description: 'minimal output' },
  },
  async run({ args }) {
    if (args.quiet) setQuiet(true);
    const conn = db();
    const { name: profile } = await resolveProfile(args.profile as string | undefined);
    requireProfile(conn, profile);

    const slug = String(args.slug);
    const slugCheck = validateSlug(slug);
    if (!slugCheck.ok) {
      console.error(errStr(slugCheck.reason));
      process.exit(1);
    }

    const dir = cronDir(profile, slug);
    if (!existsSync(dir)) {
      console.error(errStr(`cron not found: ${slug}`));
      process.exit(1);
    }

    const tty = process.stdout.isTTY && process.stdin.isTTY;
    if (!args.yes && !tty) {
      console.error(errStr('destructive operation requires --yes in non-interactive mode'));
      process.exit(1);
    }
    if (!args.yes) {
      const answer = await prompt(
        `${c.bold('delete')} cron '${slug}'? this removes the folder and run history. (y/N) `,
      );
      if (answer.toLowerCase() !== 'y') {
        console.log('  aborted.');
        return;
      }
    }

    rmSync(dir, { recursive: true, force: true });
    console.log(okStr(`deleted · ${slug}`));
  },
});
