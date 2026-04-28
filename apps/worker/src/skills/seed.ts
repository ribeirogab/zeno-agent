/**
 * Spec 0053 — boot-time skill reconciliation. Reads the file trees that
 * ship with the binary (`agent/skills/`) or with the active profile
 * (`profiles/<name>/skills/`) and seeds the DB. Runs ONCE at worker boot,
 * before the materializer.
 *
 * Semantics:
 * - `zeno_default` (agent/skills/): UPSERT each file's contents on every
 *   boot — the file is canonical, so a Zeno upgrade that changes a
 *   default skill's body propagates without manual DB intervention.
 *   Then orphan-cleanup deletes any `zeno_default` row whose name no
 *   longer exists in the file tree.
 * - `profile` (profiles/<name>/skills/): INSERT OR IGNORE — the file is
 *   the first-boot seed; after that the dashboard owns the row, so an
 *   operator's edit survives subsequent boots. Profile orphans are NOT
 *   deleted (operator may have customized the row).
 *
 * The materializer (`materializeSkillsToFs`) runs immediately after this
 * seed pass and writes whatever the DB now contains to
 * `~/.claude/skills/<name>/SKILL.md`. The SDK auto-discovers from there.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Logger } from '@zeno/logger';
import type { SkillRepo } from '@zeno/storage';
import { parse as parseYaml } from 'yaml';

export interface SeedReport {
  zenoDefault: number;
  profile: number;
  orphansRemoved: string[];
  cascadeAffected: number;
}

interface ParsedSkill {
  name: string;
  description: string;
  body: string;
}

/**
 * Same kebab-case rule the API parser enforces for uploaded skills (see
 * `apps/api/src/lib/parse-skill-frontmatter.ts`). Defense-in-depth: a
 * malicious or buggy SKILL.md file shipped under `agent/skills/` or
 * `profiles/<name>/skills/` could otherwise smuggle a name like
 * `../foo` into the DB; the materializer would later `mkdir(join(skillsRoot, name))`
 * and escape `~/.claude/skills/`. Profile content is mounted read-only
 * but better safe than sorry.
 */
const SKILL_NAME_REGEX = /^[a-z][a-z0-9-]*$/;

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
  return { name: front.name, description: front.description, body: match[2] };
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
  logger: Logger;
}

export function bootSkillsReconcile(deps: BootSkillsReconcileDeps): SeedReport {
  const zenoFiles = listSkillDir(deps.agentSkillsRoot);
  for (const file of zenoFiles) {
    deps.skills.upsertBySource({ ...file, source: 'zeno_default' });
  }

  const profileFiles = deps.profileSkillsRoot ? listSkillDir(deps.profileSkillsRoot) : [];
  let profileSeeded = 0;
  for (const file of profileFiles) {
    // INSERT OR IGNORE semantics: only insert if no row with this name exists.
    const existing = deps.skills.getByName(file.name);
    if (!existing) {
      deps.skills.create({ ...file, source: 'profile' });
      profileSeeded++;
    }
  }

  const orphan = deps.skills.deleteOrphans(
    'zeno_default',
    zenoFiles.map((f) => f.name),
  );

  const report: SeedReport = {
    zenoDefault: zenoFiles.length,
    profile: profileSeeded,
    orphansRemoved: orphan.removed,
    cascadeAffected: orphan.cascadeAffected,
  };

  deps.logger.info(
    {
      event: 'skills_seeded',
      zenoDefault: report.zenoDefault,
      profile: report.profile,
      orphansRemoved: report.orphansRemoved.length,
    },
    `seeded ${report.zenoDefault} default + ${report.profile} profile skill(s)`,
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
