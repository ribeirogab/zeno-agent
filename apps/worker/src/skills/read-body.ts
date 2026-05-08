/**
 * Spec 0062 — read a skill's body from the canonical FS path.
 *
 * After spec 0062, skill bodies live on disk (not in the DB). Anyone who
 * needs the body resolves the canonical path via `skillRepo.canonicalPath(skill)`,
 * reads the SKILL.md file, and strips the YAML frontmatter delimiters.
 *
 * This helper centralizes the read+strip logic so callers (the
 * connector-gated-backend hook, the cron runner's [zeno_context] block,
 * etc.) don't reimplement it.
 *
 * Returns the body string (everything after the closing `---\n` of the
 * frontmatter). Returns an empty string on any failure (file missing,
 * malformed frontmatter, unreadable). Callers that care about specific
 * failure modes can check for `''` and decide how to react — for the
 * connector hook + cron runner, "no body" means "skip" which is a
 * reasonable default.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Skill, SkillRepo } from '@zeno/db/runtime';

export function readSkillBody(skill: Skill, skillRepo: SkillRepo): string {
  const skillPath = join(skillRepo.canonicalPath(skill), 'SKILL.md');
  let raw: string;
  try {
    raw = readFileSync(skillPath, 'utf8');
  } catch {
    return '';
  }
  const match = raw.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
  if (!match || match[1] === undefined) return '';
  // Trim a single leading newline if present (the frontmatter delimiter
  // pattern keeps it). Common shape: body starts with `\n# Heading...`.
  return match[1].replace(/^\n/, '');
}
