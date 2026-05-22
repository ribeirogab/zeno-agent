/**
 * Spec 2026-05-22 — `zeno cron list` — walk filesystem + join with DB cache.
 *
 * The filesystem is the authoritative source. The API's `GET /api/crons`
 * returns the slim DB cache. The CLI joins both so the operator sees rows
 * for any folder that hasn't been reconciled yet (within the 2 s poll lag).
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { defineCommand } from 'citty';
import { resolveProfileApiUrl } from '../lib/api-base.js';
import { ApiClient } from '../lib/api-client.js';
import { parseCronFile, SLUG_RE } from '../lib/cron-frontmatter.js';
import { c, err as errStr, isQuiet, setQuiet } from '../lib/output.js';
import { cronsDir } from '../lib/paths.js';
import { requireProfile } from '../lib/profile.js';
import { resolveProfile } from '../lib/resolvers.js';
import { db } from '../lib/state.js';

export interface CronListItem {
  slug: string;
  name: string;
  description: string | null;
  schedule: string;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastError: string | null;
}

interface DbCronRow {
  id: string;
  name: string;
  description: string | null;
  schedule: string;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastError: string | null;
}

export default defineCommand({
  meta: { name: 'list', description: 'list crons in the profile' },
  args: {
    profile: { type: 'string', description: 'profile name', required: false },
    json: { type: 'boolean', description: 'emit JSON', default: false },
    quiet: { type: 'boolean', description: 'minimal output' },
  },
  async run({ args }) {
    if (args.quiet) setQuiet(true);
    const conn = db();
    const { name: profile } = await resolveProfile(args.profile as string | undefined);
    requireProfile(conn, profile);

    const dir = cronsDir(profile);
    const folderSlugs: string[] = [];
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const d of entries) {
        if (!d.isDirectory()) continue;
        if (d.name.startsWith('_') || d.name.startsWith('.')) continue;
        if (!SLUG_RE.test(d.name)) continue;
        folderSlugs.push(d.name);
      }
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        console.error(errStr(`failed to read ${dir}: ${String(e)}`));
        process.exit(1);
      }
    }

    const baseUrl = await resolveProfileApiUrl(profile);
    const client = new ApiClient({ baseUrl });
    let dbRows: DbCronRow[] = [];
    try {
      dbRows = await client.get<DbCronRow[]>('/api/crons');
    } catch {
      // API unreachable — treat as no cache (worker may be down). Folder list still works.
    }
    const dbBySlug = new Map(dbRows.map((r) => [r.id, r]));

    const allSlugs = new Set([...folderSlugs, ...dbRows.map((r) => r.id)]);

    const items: CronListItem[] = [];
    for (const slug of [...allSlugs].sort()) {
      const dbRow = dbBySlug.get(slug);
      let fromDisk: ReturnType<typeof parseCronFile> | null = null;
      try {
        const raw = await fs.readFile(join(dir, slug, 'CRON.md'), 'utf-8');
        fromDisk = parseCronFile(raw);
      } catch {
        // file gone (in DB only — reconciler will delete it on next tick)
      }
      const fromOk = fromDisk?.kind === 'ok' ? fromDisk.value : null;
      items.push({
        slug,
        name: fromOk?.name ?? dbRow?.name ?? slug,
        description: fromOk?.description ?? dbRow?.description ?? null,
        schedule: fromOk?.schedule ?? dbRow?.schedule ?? '',
        enabled: fromOk?.enabled ?? dbRow?.enabled ?? false,
        lastRunAt: dbRow?.lastRunAt ?? null,
        nextRunAt: dbRow?.nextRunAt ?? null,
        lastError:
          dbRow?.lastError ??
          (fromDisk?.kind === 'error' ? `${fromDisk.code}: ${fromDisk.message}` : null),
      });
    }

    if (args.json) {
      console.log(JSON.stringify(items));
      return;
    }

    if (items.length === 0) {
      if (!isQuiet()) {
        console.log('');
        console.log('  no crons yet.');
        console.log(`  scaffold one: ${c.bold(`zeno cron create example --schedule '0 9 * * *'`)}`);
        console.log('');
      }
      return;
    }

    if (!isQuiet()) {
      console.log('');
      console.log(
        `  ${c.bold('slug'.padEnd(20))} ${c.bold('schedule'.padEnd(18))} ${c.bold(
          'status'.padEnd(10),
        )} ${c.bold('next run')}`,
      );
    }
    for (const item of items) {
      const status = item.lastError ? c.gray('error') : item.enabled ? 'on' : c.gray('off');
      const next = item.nextRunAt ?? '—';
      console.log(
        `  ${item.slug.padEnd(20)} ${item.schedule.padEnd(18)} ${String(status).padEnd(10)} ${next}`,
      );
    }
    if (!isQuiet()) console.log('');
  },
});
