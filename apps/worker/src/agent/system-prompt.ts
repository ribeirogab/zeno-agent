import { readFileSync } from 'node:fs';
import { createLogger } from '@zeno/logger';

const logger = createLogger({ service: 'worker' });

const AGENT_CANDIDATES = ['/app/agent', 'agent'];
const PROFILE_CANDIDATES = ['/app/profile', 'profile'];

const DEFAULT_SOUL =
  'You are Zeno, a personal agent. Respond helpfully and concisely in the language the user addresses you in.';

const NO_AGENTS_NOTE =
  '_AGENTS.md not found — this Zeno instance has no operating manual. Operator should write `~/.zeno/profiles/<profile>/AGENTS.md` to configure per-instance rules._';

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
 * Load a file from the agent/ directory (Zeno's shared baseline identity: SOUL.md, etc).
 * Returns null if not found in any candidate.
 */
export function loadAgentFile(filename: string): string | null {
  return loadFromCandidates(AGENT_CANDIDATES, filename);
}

/**
 * Load a file from the profile/ directory (per-instance operating manual: AGENTS.md, etc).
 * Returns null if not found in any candidate.
 */
export function loadProfileFile(filename: string): string | null {
  return loadFromCandidates(PROFILE_CANDIDATES, filename);
}

/**
 * Build the full system prompt from SOUL.md (shared baseline identity) +
 * AGENTS.md (per-instance operating manual). SOUL comes from `agent/`,
 * AGENTS from `profile/`. Pass null when files are missing — sensible
 * defaults are used.
 *
 * Spec 2026-05-20 (agents-md-per-instance): replaced the legacy
 * per-profile user-bio file (single-owner framing) with AGENTS.md
 * (per-instance operating manual). The reframe reflects reality — a
 * Zeno instance has one operator (OAuth-token owner) and N audiences
 * (people on the channel) — and removes the misleading "About the user"
 * heading from the cached system prompt.
 *
 * Spec 0052 invariant: the call site (`apps/worker/src/agent/backends/claude-code.ts`)
 * MUST wrap this return value in the preset option shape
 * `{ type: 'preset', preset: 'claude_code', append: ... }`. A bare-string
 * systemPrompt silently drops the SDK's skill listing.
 */
export function buildSystemPrompt(
  soulMdContent: string | null,
  agentsMdContent: string | null,
): string {
  const soul =
    soulMdContent && soulMdContent.trim().length > 0 ? soulMdContent.trim() : DEFAULT_SOUL;

  if (!soulMdContent) {
    logger.warn({ event: 'soul_md_missing' }, 'SOUL.md not found — using minimal default prompt');
  }

  const agents =
    agentsMdContent && agentsMdContent.trim().length > 0
      ? agentsMdContent.trim()
      : NO_AGENTS_NOTE;

  return `${soul}\n\n${agents}`;
}
