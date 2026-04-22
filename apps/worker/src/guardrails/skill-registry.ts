import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const AGENT_SKILL_CANDIDATES = ['/app/agent/skills', 'agent/skills'];
const PROFILE_SKILL_CANDIDATES = ['/app/profile/skills', 'profile/skills'];

/**
 * Map of `<skillName>` → whether the skill declared `read_only: true` in its
 * SKILL.md frontmatter. Built once at boot — hot-reload requires container
 * restart, same as MCP changes.
 */
export type SkillRegistry = Map<string, boolean>;

function findFirstExisting(candidates: string[]): string | null {
  for (const candidate of candidates) {
    try {
      if (existsSync(candidate) && statSync(candidate).isDirectory()) return candidate;
    } catch {
      // try next
    }
  }
  return null;
}

/**
 * Pull `key: value` lines out of a YAML frontmatter block (`---\n...\n---`).
 * Intentionally minimal — we only need to spot `read_only: true`.
 */
function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const body = match[1] ?? '';
  const out: Record<string, string> = {};
  for (const line of body.split(/\r?\n/)) {
    const lineMatch = line.match(/^\s*([A-Za-z0-9_]+)\s*:\s*(.+?)\s*$/);
    if (!lineMatch) continue;
    const key = lineMatch[1];
    const value = lineMatch[2];
    if (key !== undefined && value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

function scanSkillsDirectory(rootDir: string, registry: SkillRegistry): void {
  let entries: string[];
  try {
    entries = readdirSync(rootDir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const skillDir = join(rootDir, entry);
    let isDir = false;
    try {
      isDir = statSync(skillDir).isDirectory();
    } catch {
      continue;
    }
    if (!isDir) continue;
    const skillFile = join(skillDir, 'SKILL.md');
    if (!existsSync(skillFile)) continue;
    let content: string;
    try {
      content = readFileSync(skillFile, 'utf8');
    } catch {
      continue;
    }
    const frontmatter = parseFrontmatter(content);
    const readOnlyRaw = frontmatter.read_only?.toLowerCase();
    if (readOnlyRaw === 'true') {
      registry.set(entry, true);
    }
  }
}

/**
 * Build the read-only skill registry by scanning `agent/skills/*` and
 * `profile/skills/*` (in container or repo locations). Profile skills win
 * over agent skills on name collision (last write).
 */
export function loadSkillRegistry(extraRoots?: string[]): SkillRegistry {
  const registry: SkillRegistry = new Map();
  const roots: string[] = [];
  if (extraRoots) roots.push(...extraRoots);
  const agentRoot = findFirstExisting(AGENT_SKILL_CANDIDATES);
  if (agentRoot) roots.push(agentRoot);
  const profileRoot = findFirstExisting(PROFILE_SKILL_CANDIDATES);
  if (profileRoot) roots.push(profileRoot);
  for (const root of roots) scanSkillsDirectory(root, registry);
  return registry;
}

/**
 * Look up whether a tool belongs to a read-only skill. The mapping convention
 * is `mcp__<server>__<tool>` → skill named `<server>` (matches today's MCP
 * server naming under each profile's `skills/<name>/mcp.json`). Non-MCP tools and tools
 * from unknown skills return `false`.
 */
export function isToolReadOnly(registry: SkillRegistry, toolName: string): boolean {
  if (!toolName.startsWith('mcp__')) return false;
  const rest = toolName.slice('mcp__'.length);
  const sep = rest.indexOf('__');
  if (sep === -1) return false;
  const server = rest.slice(0, sep);
  return registry.get(server) === true;
}
