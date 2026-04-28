/**
 * Skills materializer — DB → ${claudeHome}/skills/<name>/SKILL.md.
 *
 * Spec 0052 Phase B.1. The Claude Agent SDK auto-discovers skills from this
 * filesystem location (`Options.skills`, `getAvailableSkills()`,
 * `permissionInputSpec.source: 'skills'`) — confirmed in B.0 gate-zero.
 * The worker's job is to keep DB and FS in sync; SDK handles listing +
 * loading from the FS.
 *
 * Strategy: full reconciliation each call.
 *   1. Read DB skills → expected set of `<name>` dirs.
 *   2. Read FS dirs in skills/.
 *   3. Delete FS dirs not in expected set (skills deleted in DB).
 *   4. Write/overwrite SKILL.md for each expected skill (frontmatter + body).
 *
 * Idempotent: safe to call N times in a row. Single source of truth: DB.
 * FS is regenerated whenever called.
 */

import type { Dirent } from 'node:fs';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Logger } from '@zeno/logger';
import type { SkillRepo } from '@zeno/storage';

export interface MaterializeDeps {
  skillRepo: SkillRepo;
  /** Absolute path to the user's `~/.claude/` dir. The materializer writes to `${claudeHome}/skills/`. */
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

  // Phase 1: clean up FS dirs that no longer have a DB row.
  let deleted = 0;
  let existingDirents: Dirent[] = [];
  try {
    existingDirents = await readdir(skillsRoot, { withFileTypes: true });
  } catch {
    existingDirents = [];
  }
  for (const dirent of existingDirents) {
    if (!dirent.isDirectory()) continue;
    if (expectedNames.has(dirent.name)) continue;
    await rm(join(skillsRoot, dirent.name), { recursive: true, force: true });
    deleted += 1;
  }

  // Phase 2: write/overwrite SKILL.md for each DB skill.
  for (const skill of skills) {
    const dir = join(skillsRoot, skill.name);
    await mkdir(dir, { recursive: true });
    const content = `---\nname: ${skill.name}\ndescription: ${skill.description}\n---\n\n${skill.body}`;
    await writeFile(join(dir, 'SKILL.md'), content, 'utf8');
  }

  deps.logger.info(
    {
      event: 'skills_materialized',
      written: skills.length,
      deleted,
      skillsRoot,
    },
    `materialized ${skills.length} skill(s) to ${skillsRoot}`,
  );

  return { written: skills.length, deleted };
}
