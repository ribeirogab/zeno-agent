import { parse as parseYaml } from 'yaml';

export interface Frontmatter {
  title?: string;
  description?: string;
  tags?: string[];
  related?: string[];
}

export interface ParsedDoc {
  frontmatter: Frontmatter | null;
  body: string;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function parseFrontmatter(raw: string): ParsedDoc {
  const match = raw.match(FRONTMATTER_RE);
  if (!match) return { frontmatter: null, body: raw };

  const yamlBlock = match[1] ?? '';
  let parsed: unknown;
  try {
    parsed = parseYaml(yamlBlock);
  } catch {
    return { frontmatter: null, body: raw };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { frontmatter: null, body: raw };
  }

  const obj = parsed as Record<string, unknown>;
  const fm: Frontmatter = {};
  if (typeof obj.title === 'string') fm.title = obj.title;
  if (typeof obj.description === 'string') fm.description = obj.description;
  if (Array.isArray(obj.tags)) {
    fm.tags = obj.tags.filter((t): t is string => typeof t === 'string');
  }
  if (Array.isArray(obj.related)) {
    fm.related = obj.related.filter((r): r is string => typeof r === 'string');
  }

  return { frontmatter: fm, body: raw.slice(match[0].length).replace(/^\r?\n/, '') };
}
