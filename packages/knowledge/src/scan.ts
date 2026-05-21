import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';
import { extractDescription } from './description.js';
import { parseFrontmatter } from './frontmatter.js';
import { extractTitle } from './title.js';

export interface FileMeta {
  relPath: string;
  title: string;
  description: string;
  tags: string[];
  related: string[];
  bytes: number;
  mtimeMs: number;
}

export function scanKnowledge(rootPath: string): FileMeta[] {
  if (!existsSync(rootPath)) return [];

  const entries = readdirSync(rootPath, { recursive: true, withFileTypes: true });
  const files: FileMeta[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.md')) continue;

    const parentRelToRoot = relative(rootPath, entry.parentPath);
    const segments = parentRelToRoot.length === 0 ? [] : parentRelToRoot.split(sep);
    if (segments.some(isIgnored)) continue;
    if (isIgnored(entry.name)) continue;

    const absPath = join(entry.parentPath, entry.name);
    const relPath = relative(rootPath, absPath).split(sep).join('/');
    const stat = statSync(absPath);
    const raw = readFileSync(absPath, 'utf8');
    const { frontmatter, body } = parseFrontmatter(raw);

    files.push({
      relPath,
      title: extractTitle({ frontmatter, body, relPath }),
      description: extractDescription({ frontmatter, body }),
      tags: frontmatter?.tags ?? [],
      related: frontmatter?.related ?? [],
      bytes: stat.size,
      mtimeMs: stat.mtimeMs,
    });
  }

  files.sort((a, b) => a.relPath.toLowerCase().localeCompare(b.relPath.toLowerCase()));
  return files;
}

function isIgnored(name: string): boolean {
  return name.startsWith('_');
}

export function isIgnoredBasename(name: string): boolean {
  return isIgnored(basename(name));
}
