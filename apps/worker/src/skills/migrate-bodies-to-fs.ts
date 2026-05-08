/**
 * Spec 0062 boot step 2: one-shot pre-migration that moves existing
 * `skills.body` content from the DB to the filesystem BEFORE migration 19
 * drops the column.
 *
 * Idempotency: at entry, query `PRAGMA table_info(skills)`. If the `body`
 * column is ABSENT, the migration already ran — skip silently. If `body`
 * IS present, run the divergence check + write logic below. Safe across
 * crashes: writing to `/workspace/skills/<name>/SKILL.md` is just an
 * overwrite; flipping `source` is `UPDATE skills SET source='dashboard'`
 * (idempotent if rerun).
 *
 * Per-source handling:
 *
 * - `source='dashboard'` rows → write `body` to `/workspace/skills/<name>/SKILL.md`.
 *   Canonical path doesn't exist yet for this source on a 0052/0053 DB.
 *
 * - `source='profile'` rows → if FS body matches DB body, no-op (the row
 *   will be re-inserted by the reconciler from FS on next boot anyway).
 *   If they DIVERGE (operator edited via spec 0052 dashboard PATCH after
 *   first-boot INSERT-OR-IGNORE), write the DB body to /workspace/skills/
 *   AND flip the row's source to 'dashboard'. Name-collision resolution:
 *   if a `dashboard` row with the same name already exists when about to
 *   flip, KEEP the existing dashboard row, DISCARD the diverged profile
 *   body, emit a WARN listing both rows so the operator can investigate.
 *
 * - `source='zeno_default'` rows → assert DB body equals FS body (these
 *   should ALWAYS match since spec 0053's UPSERT semantics rewrite DB
 *   from FS every boot). If they diverge (impossible in practice but
 *   defensive), trust FS, drop DB body silently.
 *
 * The script uses raw SQL via the `db` handle — it runs BEFORE
 * `runMigrations(db)` and BEFORE `new SkillRepo(db, roots)`, so no repo
 * objects are available.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Logger } from '@zeno/logger';
import type Database from 'better-sqlite3';

interface PreMigrateRow {
  id: string;
  name: string;
  description: string;
  body: string;
  source: 'zeno_default' | 'profile' | 'dashboard';
}

export interface PreMigrateBodiesToFsDeps {
  db: Database.Database;
  agentSkillsRoot: string;
  profileSkillsRoot: string;
  dashboardSkillsRoot: string;
  logger: Logger;
}

export interface PreMigrateReport {
  /** True if the body column was absent and the script was a no-op. */
  alreadyMigrated: boolean;
  dashboardWritten: number;
  profileFlipped: string[];
  profileSkippedNameCollision: string[];
  zenoDefaultDiverged: string[];
}

export function preMigrateBodiesToFs(deps: PreMigrateBodiesToFsDeps): PreMigrateReport {
  const cols = deps.db.prepare('PRAGMA table_info(skills)').all() as Array<{ name: string }>;
  const hasBodyColumn = cols.some((c) => c.name === 'body');
  if (!hasBodyColumn) {
    deps.logger.info(
      { event: 'skills_pre_migrate_skipped' },
      'skills.body already absent — pre-migration not needed',
    );
    return {
      alreadyMigrated: true,
      dashboardWritten: 0,
      profileFlipped: [],
      profileSkippedNameCollision: [],
      zenoDefaultDiverged: [],
    };
  }

  const rows = deps.db
    .prepare('SELECT id, name, description, body, source FROM skills')
    .all() as PreMigrateRow[];

  let dashboardWritten = 0;
  const profileFlipped: string[] = [];
  const profileSkippedNameCollision: string[] = [];
  const zenoDefaultDiverged: string[] = [];

  // Pre-build a name → source map so we can detect collisions when flipping
  // a profile row to dashboard.
  const sourceByName = new Map<string, string>();
  for (const row of rows) sourceByName.set(row.name, row.source);

  for (const row of rows) {
    const dashboardPath = join(deps.dashboardSkillsRoot, row.name);
    const dashboardSkillFile = join(dashboardPath, 'SKILL.md');

    if (row.source === 'dashboard') {
      // Write body to canonical FS path; idempotent on rerun.
      mkdirSync(dashboardPath, { recursive: true });
      const content = recomposeMarkdown(row);
      writeFileSync(dashboardSkillFile, content, 'utf8');
      dashboardWritten++;
      continue;
    }

    if (row.source === 'profile') {
      const fsPath = join(deps.profileSkillsRoot, row.name, 'SKILL.md');
      const fsBody = safeReadFileBody(fsPath);
      // Direct body comparison: the FS file is the source-of-truth
      // post-spec-0053; if DB body equals what we'd extract from FS, no
      // divergence happened. Otherwise the operator edited via dashboard
      // PATCH and we need to flip.
      if (fsBody !== null && fsBody === row.body) {
        // No divergence — the reconciler will re-INSERT-OR-IGNORE this
        // profile row from FS on next boot. Nothing to write here.
        continue;
      }
      // Diverged. Try to flip to dashboard. Check name collision first.
      // (UNIQUE(name) means we shouldn't see two rows with the same name —
      // the SELECT returns at most one. The check is defensive against a
      // tampered schema.)
      const otherSource = sourceByName.get(row.name);
      if (otherSource && otherSource !== 'profile') {
        // Both a profile row (this one) and a dashboard row with the same
        // name? In practice this shouldn't happen because UNIQUE(name) is
        // enforced — but the rows came from a single SELECT, so the only
        // way to have both is for the iteration to surface them as one row
        // each. Defensive: we can't have two rows with the same name post
        // UNIQUE. But just in case the schema was tampered with, we skip.
        profileSkippedNameCollision.push(row.name);
        deps.logger.warn(
          {
            event: 'skills_pre_migrate_profile_collision',
            name: row.name,
          },
          `profile row '${row.name}' diverged AND a dashboard row with the same name exists — skipping flip; investigate`,
        );
        continue;
      }
      mkdirSync(dashboardPath, { recursive: true });
      const content = recomposeMarkdown(row);
      writeFileSync(dashboardSkillFile, content, 'utf8');
      deps.db.prepare(`UPDATE skills SET source = 'dashboard' WHERE id = ?`).run(row.id);
      profileFlipped.push(row.name);
      deps.logger.warn(
        {
          event: 'skills_pre_migrate_profile_flipped',
          name: row.name,
          newCanonicalPath: dashboardPath,
        },
        `profile row '${row.name}' had diverged from FS; flipped to dashboard source and wrote DB body to /workspace/skills/`,
      );
      continue;
    }

    if (row.source === 'zeno_default') {
      const fsPath = join(deps.agentSkillsRoot, row.name, 'SKILL.md');
      const fsBody = safeReadFileBody(fsPath);
      if (fsBody === null || fsBody === row.body) {
        // Match (or FS file missing — treat as match; reconciler will sort
        // out a missing file via deleteOrphans on next boot).
        continue;
      }
      // Diverged — should be impossible under spec 0053's UPSERT semantics,
      // but defensive: trust FS, no write needed (the FS body wins).
      zenoDefaultDiverged.push(row.name);
      deps.logger.warn(
        {
          event: 'skills_pre_migrate_zeno_default_diverged',
          name: row.name,
        },
        `zeno_default row '${row.name}' has DB body that diverges from FS (impossible under spec 0053 UPSERT — investigate)`,
      );
    }
  }

  deps.logger.info(
    {
      event: 'skills_pre_migrate_complete',
      dashboardWritten,
      profileFlipped: profileFlipped.length,
      profileSkippedNameCollision: profileSkippedNameCollision.length,
      zenoDefaultDiverged: zenoDefaultDiverged.length,
    },
    `pre-migrated ${dashboardWritten} dashboard skill(s), flipped ${profileFlipped.length} diverged profile skill(s) to dashboard`,
  );

  return {
    alreadyMigrated: false,
    dashboardWritten,
    profileFlipped,
    profileSkippedNameCollision,
    zenoDefaultDiverged,
  };
}

/** Recompose a SKILL.md from frontmatter + body. */
function recomposeMarkdown(row: PreMigrateRow): string {
  return `---\nname: ${row.name}\ndescription: ${row.description}\n---\n\n${row.body}`;
}

/**
 * Read the body section of a SKILL.md file (everything after the
 * `---\n...\n---\n` frontmatter). Returns null if the file doesn't exist
 * or doesn't have valid frontmatter delimiters.
 */
function safeReadFileBody(path: string): string | null {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return null;
  }
  const match = raw.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
  if (!match || match[1] === undefined) return null;
  return match[1];
}
