/**
 * Spec 2026-05-22 — `zeno cron disable <slug>` — flip frontmatter `enabled: false`.
 */

import { existsSync } from 'node:fs';
import { defineCommand } from 'citty';
import { rewriteFrontmatter, validateSlug } from '../lib/cron-frontmatter.js';
import { err as errStr, ok as okStr, setQuiet } from '../lib/output.js';
import { cronFile } from '../lib/paths.js';
import { requireProfile } from '../lib/profile.js';
import { resolveProfile } from '../lib/resolvers.js';
import { db } from '../lib/state.js';

export default defineCommand({
  meta: { name: 'disable', description: 'set enabled: false in the cron frontmatter' },
  args: {
    slug: { type: 'positional', description: 'cron slug', required: true },
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

    const path = cronFile(profile, slug);
    if (!existsSync(path)) {
      console.error(errStr(`cron not found: ${slug}`));
      process.exit(1);
    }

    try {
      await rewriteFrontmatter(path, (data) => ({ ...data, enabled: false }));
    } catch (e) {
      console.error(errStr(`failed to disable ${slug}: ${String(e)}`));
      process.exit(1);
    }

    console.log(okStr(`disabled · ${slug}`));
  },
});
