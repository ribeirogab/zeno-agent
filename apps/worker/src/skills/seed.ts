/**
 * Spec 0053 — boot-time skill reconciliation. Reads the file trees that
 * ship with the binary (`agent/skills/`) or with the active profile
 * (`profiles/<name>/skills/`) and seeds the DB. Runs ONCE at worker boot,
 * before the materializer.
 *
 * Spec 0062 — extends the reconciler to also scan `/workspace/skills/`
 * (the writable volume for dashboard-uploaded skills). Each `<name>/`
 * subdirectory there must have a `SKILL.md` at root; the reconciler
 * UPSERTs the metadata into the `skills` table with `source='dashboard'`.
 *
 * Semantics:
 * - `zeno_default` (agent/skills/): UPSERT each file's metadata on every
 *   boot — the file is canonical, so a Zeno upgrade that changes a
 *   default skill's description propagates without manual DB intervention.
 *   Then orphan-cleanup deletes any `zeno_default` row whose name no
 *   longer exists in the file tree.
 * - `profile` (profiles/<name>/skills/): INSERT OR IGNORE — the file is
 *   the first-boot seed; after that the dashboard owns the row, so an
 *   operator's edit survives subsequent boots. Profile orphans are NOT
 *   deleted (operator may have customized the row).
 * - `dashboard` (/workspace/skills/): UPSERT each file's metadata on every
 *   boot — power-user SSH-drops are recognized at next boot. Dashboard
 *   orphans (DB row exists but FS dir is gone) are DELETED, but only when
 *   the safety guard passes (root exists AND non-empty) — protects against
 *   silent mass-deletion during partial disaster recovery.
 *
 * Spec 0062 — `body` no longer flows through the type. The parser still
 * extracts name + description from frontmatter, but the body content
 * stays on disk; whoever needs to read it resolves canonicalPath(skill)
 * and reads the file.
 *
 * The materializer (`materializeSkillsToFs`) runs immediately after this
 * seed pass and creates a symlink farm under `~/.claude/skills/<name>`
 * pointing at the canonical FS path. The SDK auto-discovers from there.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { SkillRepo, SkillSource } from '@zeno/db/runtime';
import type { Logger } from '@zeno/logger';
import { parse as parseYaml } from 'yaml';

export interface SeedReport {
  zenoDefault: number;
  profile: number;
  dashboard: number;
  orphansRemoved: string[];
  cascadeAffected: number;
  dashboardOrphansSkipped: string[];
}

interface ParsedSkill {
  name: string;
  description: string;
}

/**
 * Same kebab-case rule the API parser enforces for uploaded skills (see
 * `apps/api/src/lib/parse-skill-frontmatter.ts`). Defense-in-depth: a
 * malicious or buggy SKILL.md file shipped under `agent/skills/`,
 * `profiles/<name>/skills/`, or dropped via SSH into `/workspace/skills/`
 * could otherwise smuggle a name like `../foo` into the DB; the
 * materializer would later try to symlink that path inside `~/.claude/skills/`.
 */
const SKILL_NAME_REGEX = /^[a-z][a-z0-9-]*$/;

/**
 * Spec 0062: returns metadata only; body content stays on disk at its
 * canonical path. Returns null on parse failure (frontmatter missing,
 * name invalid, etc.) so the caller can skip that dir.
 */
function readSkillFile(filePath: string): ParsedSkill | null {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match || !match[1] || match[2] === undefined) return null;
  let front: { name?: unknown; description?: unknown };
  try {
    front = parseYaml(match[1]) as { name?: unknown; description?: unknown };
  } catch {
    return null;
  }
  if (typeof front.name !== 'string' || typeof front.description !== 'string') return null;
  if (!SKILL_NAME_REGEX.test(front.name)) return null;
  return { name: front.name, description: front.description };
}

function listSkillDir(root: string): ParsedSkill[] {
  const out: ParsedSkill[] = [];
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return out;
  }
  for (const entry of entries) {
    // Skip extraction tmp dirs — they're transient, not skills.
    if (entry.startsWith('.tmp-')) continue;
    const path = join(root, entry);
    let isDir = false;
    try {
      isDir = statSync(path).isDirectory();
    } catch {
      continue;
    }
    if (!isDir) continue;
    const skillFile = join(path, 'SKILL.md');
    try {
      statSync(skillFile);
    } catch {
      continue;
    }
    const parsed = readSkillFile(skillFile);
    if (parsed) out.push(parsed);
  }
  return out;
}

export interface BootSkillsReconcileDeps {
  skills: SkillRepo;
  /** Absolute path to `agent/skills/` (Zeno's binary-shipped defaults). May not exist; missing dir → 0 defaults. */
  agentSkillsRoot: string;
  /** Absolute path to `profiles/<name>/skills/`. `null` if the active profile has no skills dir or no profile is active. */
  profileSkillsRoot: string | null;
  /** Spec 0062: absolute path to `/workspace/skills/` (dashboard upload volume, writable). */
  dashboardSkillsRoot: string;
  logger: Logger;
}

export function bootSkillsReconcile(deps: BootSkillsReconcileDeps): SeedReport {
  // 1. Zeno-shipped defaults: UPSERT description on every boot, then
  //    delete-orphan any zeno_default row whose name no longer ships.
  const zenoFiles = listSkillDir(deps.agentSkillsRoot);
  for (const file of zenoFiles) {
    deps.skills.upsertBySource({ ...file, source: 'zeno_default' });
  }

  // 2. Profile-shipped: INSERT OR IGNORE on first boot; subsequent edits
  //    via dashboard survive.
  const profileFiles = deps.profileSkillsRoot ? listSkillDir(deps.profileSkillsRoot) : [];
  let profileSeeded = 0;
  for (const file of profileFiles) {
    const existing = deps.skills.getByName(file.name);
    if (!existing) {
      deps.skills.create({ ...file, source: 'profile' });
      profileSeeded++;
    }
  }

  // 3. Dashboard volume: UPSERT description on every boot — SSH-drops are
  //    seen at next reboot. Then dashboard orphan-cleanup with the safety
  //    guard.
  const dashboardFiles = listSkillDir(deps.dashboardSkillsRoot);
  let dashboardUpserted = 0;
  for (const file of dashboardFiles) {
    deps.skills.upsertBySource({ ...file, source: 'dashboard' });
    dashboardUpserted++;
  }

  const orphan = deps.skills.deleteOrphans(
    'zeno_default',
    zenoFiles.map((f) => f.name),
  );

  // 4. Dashboard orphan cleanup with safety guard. Only delete dashboard
  //    rows whose canonical FS dir is missing IF /workspace/skills/ exists
  //    AND contains at least one valid <name>/SKILL.md. If the volume is
  //    missing or empty (e.g., partial disaster recovery), emit a WARN and
  //    skip the delete — protects against silent mass-deletion.
  const dashboardOrphansSkipped: string[] = [];
  let dashboardRoomExists = true;
  try {
    statSync(deps.dashboardSkillsRoot);
  } catch {
    dashboardRoomExists = false;
  }
  const safetyGuardPasses = dashboardRoomExists && dashboardFiles.length > 0;

  if (safetyGuardPasses) {
    const expectedNames = new Set(dashboardFiles.map((f) => f.name));
    const allRows = deps.skills.list();
    for (const row of allRows) {
      if (row.source !== 'dashboard') continue;
      if (expectedNames.has(row.name)) continue;
      // Orphan: DB row exists but FS dir is gone. Safe to remove.
      deps.skills.delete(row.id);
    }
  } else {
    // Safety guard tripped — collect the names that WOULD have been deleted
    // for the operator's audit log.
    const expectedNames = new Set(dashboardFiles.map((f) => f.name));
    const allRows = deps.skills.list();
    for (const row of allRows) {
      if (row.source !== 'dashboard') continue;
      if (expectedNames.has(row.name)) continue;
      dashboardOrphansSkipped.push(row.name);
    }
    if (dashboardOrphansSkipped.length > 0) {
      deps.logger.warn(
        {
          event: 'skills_dashboard_orphan_cleanup_skipped',
          skipped: dashboardOrphansSkipped,
          dashboardSkillsRoot: deps.dashboardSkillsRoot,
          rootExists: dashboardRoomExists,
          rowsFound: dashboardFiles.length,
        },
        `${dashboardOrphansSkipped.length} dashboard orphan row(s) NOT deleted (safety guard: root missing or empty — possible partial DR)`,
      );
    }
  }

  const report: SeedReport = {
    zenoDefault: zenoFiles.length,
    profile: profileSeeded,
    dashboard: dashboardUpserted,
    orphansRemoved: orphan.removed,
    cascadeAffected: orphan.cascadeAffected,
    dashboardOrphansSkipped,
  };

  deps.logger.info(
    {
      event: 'skills_seeded',
      zenoDefault: report.zenoDefault,
      profile: report.profile,
      dashboard: report.dashboard,
      orphansRemoved: report.orphansRemoved.length,
    },
    `seeded ${report.zenoDefault} default + ${report.profile} profile + ${report.dashboard} dashboard skill(s)`,
  );

  if (orphan.removed.length > 0) {
    deps.logger.info(
      {
        event: 'skills_orphan_cleanup_complete',
        removed: orphan.removed,
        cascadeAffected: orphan.cascadeAffected,
      },
      `removed ${orphan.removed.length} orphan zeno_default skill(s); cascade affected ${orphan.cascadeAffected} connector_skills row(s)`,
    );
  }

  return report;
}

// Re-exported for tests. SkillSource is imported above for documentation
// purposes; this re-export keeps the seed module's surface small.
export type { SkillSource };
