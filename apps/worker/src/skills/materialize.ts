/**
 * Skills materializer — DB → ${claudeHome}/skills/<name> (symlink).
 *
 * Spec 0062: each skill is a directory tree at the canonical FS path
 * (`agent/skills/`, `profile/skills/`, or `/workspace/skills/` depending
 * on source). The Claude Agent SDK discovers skills under
 * `~/.claude/skills/` via plain FS calls — symlinks are followed
 * transparently. So instead of copying file content into ~/.claude, we
 * symlink ~/.claude/skills/<name> → canonicalPath(skill).
 *
 * Strategy: full reconciliation each call.
 *   1. Read DB skills → expected set of `<name>` symlinks.
 *   2. Read existing entries in `${claudeHome}/skills/`.
 *   3. Remove entries not in the expected set (skills deleted in DB).
 *   4. For each expected skill, ensure a symlink exists pointing at the
 *      canonical path. Write to a tmp name then rename for atomicity.
 *
 * Idempotent: safe to call N times in a row. Single source of truth: DB
 * + FS canonical paths. The materializer's output is a derived farm.
 */

import type { Dirent } from 'node:fs';
import { lstat, mkdir, readdir, rename, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { Logger } from '@zeno/logger';
import type { SkillRepo } from '@zeno/storage';

export interface MaterializeDeps {
  skillRepo: SkillRepo;
  /** Absolute path to the user's `~/.claude/` dir. The materializer writes symlinks to `${claudeHome}/skills/`. */
  claudeHome: string;
  logger: Logger;
}

export interface MaterializeResult {
  written: number;
  deleted: number;
}

export async function materializeSkillsToFs(deps: MaterializeDeps): Promise<MaterializeResult> {
  const skillsRoot = join(deps.claudeHome, 'skills');
  await mkdir(skillsRoot, { recursive: true });

  const skills = deps.skillRepo.list();
  const expectedNames = new Set(skills.map((s) => s.name));

  // Phase 1: clean up FS entries that no longer have a DB row.
  // Each entry might be a symlink (post-spec-0062), a directory (legacy
  // file-write era), or a stale tmp symlink (.tmp-<name> from a crashed
  // rename). All three are removed if their final name is not expected
  // OR if their name starts with `.tmp-`.
  let deleted = 0;
  let existingDirents: Dirent[] = [];
  try {
    existingDirents = await readdir(skillsRoot, { withFileTypes: true });
  } catch {
    existingDirents = [];
  }
  for (const dirent of existingDirents) {
    const isStaleTmp = dirent.name.startsWith('.tmp-');
    const isOrphan = !expectedNames.has(dirent.name);
    if (!isStaleTmp && !isOrphan) continue;
    await rm(join(skillsRoot, dirent.name), { recursive: true, force: true });
    deleted += 1;
  }

  // Phase 2: ensure a symlink at <skillsRoot>/<name> points to canonicalPath(skill).
  // Atomic via tmp-symlink + rename — if the link already points at the
  // right target we still recreate it for simplicity; the cost is negligible.
  for (const skill of skills) {
    const target = deps.skillRepo.canonicalPath(skill);
    const linkPath = join(skillsRoot, skill.name);
    const tmpLinkPath = join(skillsRoot, `.tmp-${skill.name}`);

    // Remove any pre-existing entry at the final link path so the rename
    // doesn't clobber a directory or stale symlink.
    await rm(linkPath, { recursive: true, force: true });
    // Same for the tmp slot, which a previous crashed run may have left.
    await rm(tmpLinkPath, { recursive: true, force: true });

    await symlink(target, tmpLinkPath, 'dir');
    await rename(tmpLinkPath, linkPath);
  }

  deps.logger.info(
    {
      event: 'skills_materialized',
      written: skills.length,
      deleted,
      skillsRoot,
    },
    `materialized ${skills.length} skill symlink(s) to ${skillsRoot}`,
  );

  return { written: skills.length, deleted };
}

/**
 * Spec 0062 boot step 1: clean up partial-extract orphans before any
 * other code reads `/workspace/skills/`. The dashboard zip-install
 * pipeline extracts to `.tmp-<uuid>/` before atomically renaming to
 * `<name>/`; if the worker crashed between extract and rename, the tmp
 * dir survives. This call removes all `.tmp-*` entries at the
 * dashboardSkillsRoot before the reconciler's safety guard checks
 * "is this dir non-empty?" — without the cleanup-first ordering, a
 * volume containing only orphans would pass the guard and trigger
 * dashboard-row deletion against an effectively-empty volume.
 */
export async function cleanupTmpExtractDirs(dashboardSkillsRoot: string): Promise<void> {
  let entries: Dirent[] = [];
  try {
    entries = await readdir(dashboardSkillsRoot, { withFileTypes: true });
  } catch {
    // dir doesn't exist yet — nothing to clean
    return;
  }
  for (const entry of entries) {
    if (!entry.name.startsWith('.tmp-')) continue;
    await rm(join(dashboardSkillsRoot, entry.name), { recursive: true, force: true });
  }
}

/** Internal: exposed for the materializer test (assert lstat returns symlink). */
export async function isSymlink(path: string): Promise<boolean> {
  try {
    const stat = await lstat(path);
    return stat.isSymbolicLink();
  } catch {
    return false;
  }
}
