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
 * Spec 0052: skills are back as DB-managed playbooks materialized to
 * `~/.claude/skills/<name>/SKILL.md` and auto-discovered by the Claude Agent
 * SDK via `settingSources: ['user']`. The SDK announces each skill as a
 * `<name>: <description>` line in the system prompt — but ONLY when the
 * `systemPrompt` option is the preset shape `{ type: 'preset', preset:
 * 'claude_code', append: ... }`. A bare-string `systemPrompt` replaces the
 * preset entirely and silently drops the skill listing. See spec 0060 for
 * the realignment that wired this correctly. The function returns a string;
 * the call site (`apps/worker/src/agent/backends/claude-code.ts`) wraps it
 * in the preset option shape.
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
