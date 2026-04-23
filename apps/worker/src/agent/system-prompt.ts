import { existsSync, readFileSync } from 'node:fs';
import { createLogger } from '@zeno/logger';

const logger = createLogger({ service: 'worker' });

const AGENT_CANDIDATES = ['/app/agent', 'agent'];
const PROFILE_CANDIDATES = ['/app/profile', 'profile'];
const SKILL_CANDIDATES = [
  ['/app/profile/skills', '/app/agent/skills'],
  ['profile/skills', 'agent/skills'],
];

const DEFAULT_SOUL =
  'You are Zeno, a personal agent. Respond helpfully and concisely in the language the user addresses you in.';

const NO_USER_NOTE =
  '_USER.md not found — Zeno is operating without user-specific context. Address the user generically and ask for missing details (name, github username, preferences) when relevant._';

function loadFromCandidates(candidates: string[], filename: string): string | null {
  for (const base of candidates) {
    try {
      const content = readFileSync(`${base}/${filename}`, 'utf8').trim();
      if (content.length > 0) return content;
    } catch {
      // try next candidate
    }
  }
  return null;
}

/**
 * Load a file from the agent/ directory (Zeno's identity: SOUL.md, etc).
 * Returns null if not found in any candidate.
 */
export function loadAgentFile(filename: string): string | null {
  return loadFromCandidates(AGENT_CANDIDATES, filename);
}

/**
 * Load a file from the profile/ directory (user-specific: USER.md, etc).
 * Returns null if not found in any candidate.
 */
export function loadProfileFile(filename: string): string | null {
  return loadFromCandidates(PROFILE_CANDIDATES, filename);
}

/**
 * Load the content of always-active skills listed in the profile config.
 * Searches profile/skills/ first, then agent/skills/ as fallback (same
 * priority as the entrypoint symlink mechanism).
 */
export function loadAlwaysActiveSkills(skillNames: string[]): string[] {
  if (skillNames.length === 0) return [];

  const contents: string[] = [];
  for (const name of skillNames) {
    let found = false;
    for (const [profileDir, agentDir] of SKILL_CANDIDATES) {
      for (const dir of [profileDir, agentDir]) {
        const path = `${dir}/${name}/SKILL.md`;
        if (!existsSync(path)) continue;
        try {
          const raw = readFileSync(path, 'utf8').trim();
          if (raw.length > 0) {
            const withoutFrontmatter = raw.replace(/^---[\s\S]*?---\s*/, '').trim();
            contents.push(withoutFrontmatter);
            logger.info(
              { event: 'always_active_skill_loaded', skill: name, path },
              'always-active skill loaded',
            );
            found = true;
            break;
          }
        } catch {
          continue;
        }
      }
      if (found) break;
    }
    if (!found) {
      logger.warn(
        { event: 'always_active_skill_missing', skill: name },
        'always-active skill not found',
      );
    }
  }
  return contents;
}

/**
 * Build the full system prompt from SOUL.md (agent identity) + USER.md (user profile)
 * + always-active skills. SOUL comes from agent/, USER from profile/, skills from both.
 * Pass null when files are missing — sensible defaults are used.
 */
export function buildSystemPrompt(
  soulMdContent: string | null,
  userMdContent: string | null,
  alwaysActiveSkillContents: string[] = [],
): string {
  const soul =
    soulMdContent && soulMdContent.trim().length > 0 ? soulMdContent.trim() : DEFAULT_SOUL;

  if (!soulMdContent) {
    logger.warn({ event: 'soul_md_missing' }, 'SOUL.md not found — using minimal default prompt');
  }

  const userBlock =
    userMdContent && userMdContent.trim().length > 0 ? userMdContent.trim() : NO_USER_NOTE;

  const parts = [`${soul}\n\n# About the user\n\n${userBlock}`];

  if (alwaysActiveSkillContents.length > 0) {
    parts.push('\n\n# Active skills\n');
    parts.push(alwaysActiveSkillContents.join('\n\n---\n\n'));
  }

  return parts.join('');
}
