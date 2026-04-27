import { existsSync, readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';

const CANDIDATES = ['/app/profile', 'profile', '/app/agent', 'agent'];

/**
 * Read `always_active_skills` list from config.yaml. Checks profile first,
 * then agent as fallback. Returns empty array if not found.
 */
export function loadAlwaysActiveSkillNames(): string[] {
  for (const base of CANDIDATES) {
    const path = `${base}/config.yaml`;
    if (!existsSync(path)) continue;
    try {
      const raw = readFileSync(path, 'utf8');
      const parsed = parseYaml(raw) as Record<string, unknown> | null;
      const skills = parsed?.always_active_skills;
      if (Array.isArray(skills) && skills.length > 0) {
        return skills.filter((name): name is string => typeof name === 'string');
      }
    } catch {}
  }
  return [];
}
