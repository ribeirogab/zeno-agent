/**
 * Spec 2026-05-22 — `zeno cron enable <slug>` — flip frontmatter `enabled: true`.
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
  meta: { name: 'enable', description: 'set enabled: true in the cron frontmatter' },
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
      await rewriteFrontmatter(path, (data) => ({ ...data, enabled: true }));
    } catch (e) {
      console.error(errStr(`failed to enable ${slug}: ${String(e)}`));
      process.exit(1);
    }

    console.log(okStr(`enabled · ${slug}`));
  },
});
