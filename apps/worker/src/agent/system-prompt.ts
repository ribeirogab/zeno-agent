import { readFileSync } from 'node:fs';
import { createLogger } from '@zeno/logger';

const logger = createLogger({ service: 'worker' });

const AGENT_CANDIDATES = ['/app/agent', 'agent'];
const PROFILE_CANDIDATES = ['/app/profile', 'profile'];

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
 * Build the full system prompt from SOUL.md (agent identity) + USER.md (user
 * profile). SOUL comes from agent/, USER from profile/. Pass null when files
 * are missing — sensible defaults are used.
 *
 * Spec 0050: skills (per-domain knowledge files) are no longer part of the
 * runtime; the third-arg `alwaysActiveSkillContents` parameter and its
 * supporting loader were removed alongside the skill registry and policy
 * chain. If skills return (possibly bundled with connectors) a future spec
 * will reintroduce a different signature.
 */
export function buildSystemPrompt(
  soulMdContent: string | null,
  userMdContent: string | null,
): string {
  const soul =
    soulMdContent && soulMdContent.trim().length > 0 ? soulMdContent.trim() : DEFAULT_SOUL;

  if (!soulMdContent) {
    logger.warn({ event: 'soul_md_missing' }, 'SOUL.md not found — using minimal default prompt');
  }

  const userBlock =
    userMdContent && userMdContent.trim().length > 0 ? userMdContent.trim() : NO_USER_NOTE;

  return `${soul}\n\n# About the user\n\n${userBlock}`;
}
