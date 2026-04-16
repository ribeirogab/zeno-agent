import { readFileSync } from 'node:fs';
import { createLogger } from '@zeno/logger';

const logger = createLogger({ service: 'worker' });

const PROFILE_CANDIDATES = ['/app/profile', 'profile'];

const DEFAULT_SOUL =
  'You are Zeno, a personal agent. Respond helpfully and concisely in Brazilian Portuguese.';

const NO_USER_NOTE =
  '_USER.md not found — Zeno is operating without user-specific context. Address the user generically and ask for missing details (name, github username, preferences) when relevant._';

/**
 * Load a file from the profile/ directory, trying container path first then dev path.
 * Returns null if not found in any candidate.
 */
export function loadProfileFile(filename: string): string | null {
  for (const base of PROFILE_CANDIDATES) {
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
 * Build the full system prompt from SOUL.md (agent identity) + USER.md (user profile).
 * Both come from profile/. Pass null when either file is missing — sensible defaults are used.
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
