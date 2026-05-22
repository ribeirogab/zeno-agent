/**
 * Spec 2026-05-22 — `zeno cron show <slug>` — print parsed CRON.md.
 */

import { promises as fs } from 'node:fs';
import { defineCommand } from 'citty';
import { parseCronFile, validateSlug } from '../lib/cron-frontmatter.js';
import { c, err as errStr, isQuiet, setQuiet } from '../lib/output.js';
import { cronFile } from '../lib/paths.js';
import { requireProfile } from '../lib/profile.js';
import { resolveProfile } from '../lib/resolvers.js';
import { db } from '../lib/state.js';

export default defineCommand({
  meta: { name: 'show', description: 'print parsed CRON.md (frontmatter + body)' },
  args: {
    slug: { type: 'positional', description: 'cron slug', required: true },
    profile: { type: 'string', description: 'profile name', required: false },
    json: { type: 'boolean', description: 'emit JSON', default: false },
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
    let raw: string;
    try {
      raw = await fs.readFile(path, 'utf-8');
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        console.error(errStr(`cron not found: ${slug}`));
      } else {
        console.error(errStr(`failed to read ${path}: ${String(e)}`));
      }
      process.exit(1);
    }

    const parsed = parseCronFile(raw);
    if (parsed.kind === 'error') {
      if (args.json) {
        console.log(JSON.stringify({ slug, error: parsed.code, message: parsed.message, raw }));
        return;
      }
      console.error(errStr(`${parsed.code}: ${parsed.message}`));
      process.exit(1);
    }

    if (args.json) {
      console.log(
        JSON.stringify({
          slug,
          name: parsed.value.name,
          description: parsed.value.description,
          schedule: parsed.value.schedule,
          enabled: parsed.value.enabled,
          body: parsed.value.body,
        }),
      );
      return;
    }

    if (!isQuiet()) console.log('');
    console.log(`  ${c.bold('name')}        ${parsed.value.name}`);
    if (parsed.value.description) {
      console.log(`  ${c.bold('description')} ${parsed.value.description}`);
    }
    console.log(`  ${c.bold('schedule')}    ${parsed.value.schedule}`);
    console.log(`  ${c.bold('enabled')}     ${parsed.value.enabled}`);
    if (!isQuiet()) console.log('');
    console.log(`  ${c.bold('prompt')}`);
    console.log('');
    for (const line of parsed.value.body.trimEnd().split('\n')) {
      console.log(`  ${line}`);
    }
    if (!isQuiet()) console.log('');
  },
});
