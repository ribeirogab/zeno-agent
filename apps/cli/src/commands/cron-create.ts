/**
 * Spec 2026-05-22 — `zeno cron create <slug>` — scaffold a cron folder.
 *
 * Required: --schedule '<expr>'. Optional: --name (default: titlecase of slug),
 * --description. Refuses to overwrite an existing folder. Validates schedule
 * via cron-parser before any FS write. Does NOT launch an editor — prints the
 * path so the operator opens it themselves.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineCommand } from 'citty';
import { CronExpressionParser } from 'cron-parser';
import matter from 'gray-matter';
import { validateSlug } from '../lib/cron-frontmatter.js';
import { c, err as errStr, ok as okStr, setQuiet } from '../lib/output.js';
import { cronDir, cronFile, cronsDir } from '../lib/paths.js';
import { requireProfile } from '../lib/profile.js';
import { resolveProfile } from '../lib/resolvers.js';
import { db } from '../lib/state.js';

function titleCase(slug: string): string {
  return slug
    .split('-')
    .map((w) => (w.length === 0 ? '' : (w[0] ?? '').toUpperCase() + w.slice(1)))
    .join(' ');
}

const FALLBACK_TEMPLATE = [
  '---',
  'name: placeholder',
  "schedule: '* * * * *'",
  'enabled: false',
  '---',
  'Replace this body with the prompt the agent should run.',
  '',
].join('\n');

export default defineCommand({
  meta: { name: 'create', description: 'scaffold a new cron folder + CRON.md' },
  args: {
    slug: { type: 'positional', description: 'cron slug (lowercase, kebab-case)', required: true },
    schedule: {
      type: 'string',
      description: "cron expression, e.g. '0 9 * * 1-5'",
      required: true,
    },
    name: { type: 'string', description: 'human-readable name (default = titleCase(slug))' },
    description: { type: 'string', description: 'optional one-line summary' },
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

    const schedule = String(args.schedule);
    try {
      CronExpressionParser.parse(schedule);
    } catch (e) {
      console.error(errStr(`invalid cron expression: ${(e as Error).message}`));
      process.exit(1);
    }

    const dir = cronDir(profile, slug);
    if (existsSync(dir)) {
      console.error(errStr(`cron already exists at ${dir}`));
      process.exit(1);
    }

    let templateRaw: string;
    try {
      templateRaw = readFileSync(join(cronsDir(profile), '_template', 'CRON.md'), 'utf-8');
    } catch {
      templateRaw = FALLBACK_TEMPLATE;
    }

    const parsed = matter(templateRaw);
    const newData: Record<string, unknown> = {
      ...parsed.data,
      name: String(args.name ?? titleCase(slug)),
      schedule,
      enabled: true,
    };
    if (args.description) newData.description = String(args.description);

    const newBytes = matter.stringify(parsed.content, newData);
    mkdirSync(dir, { recursive: true });
    writeFileSync(cronFile(profile, slug), newBytes, 'utf-8');

    console.log(okStr(`created · ${c.gray(cronFile(profile, slug))}`));
    console.log('  edit the body in your editor; CronManager picks up within 2s.');
  },
});
