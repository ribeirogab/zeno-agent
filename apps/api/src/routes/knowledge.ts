import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import {
  extractTitle,
  extractWikilinks,
  parseFrontmatter,
  resolveWikilinks,
} from '@zeno/knowledge';
import { Hono } from 'hono';

export interface KnowledgeRouteDeps {
  knowledgeRoot: string;
}

interface FileSummary {
  path: string;
  title: string;
  bytes: number;
  mtime: string;
  tags: string[];
}

interface FilesResponse {
  files: FileSummary[];
  totalBytes: number;
  totalFiles: number;
}

interface FileResponse {
  path: string;
  content: string;
  frontmatter: Record<string, unknown> | null;
  title: string;
  mtime: string;
  bytes: number;
  wikilinks: Record<string, string | null>;
}

export function buildKnowledgeRoute(deps: KnowledgeRouteDeps): Hono {
  const route = new Hono();
  const { knowledgeRoot } = deps;

  route.get('/files', (c) => {
    const files = listFiles(knowledgeRoot);
    const totalBytes = files.reduce((sum, f) => sum + f.bytes, 0);
    const body: FilesResponse = { files, totalBytes, totalFiles: files.length };
    return c.json(body);
  });

  route.get('/file', (c) => {
    const requested = c.req.query('path');
    if (typeof requested !== 'string' || requested.length === 0) {
      return c.json({ error: 'invalid_path' as const }, 400);
    }
    const guarded = guardPath(knowledgeRoot, requested);
    if (guarded === null) {
      return c.json({ error: 'invalid_path' as const }, 400);
    }
    if (!existsSync(guarded)) {
      return c.json({ error: 'not_found' as const }, 404);
    }
    let raw: string;
    let stat: ReturnType<typeof statSync>;
    try {
      raw = readFileSync(guarded, 'utf8');
      stat = statSync(guarded);
    } catch (err) {
      return c.json({ error: 'read_failed' as const, detail: String(err) }, 500);
    }
    const parsed = parseFrontmatter(raw);
    // parseFrontmatter never throws — malformed YAML returns
    // { frontmatter: null, body: raw } so the original content carries
    // the unparsable header through to the viewer.
    const allPaths = listFiles(knowledgeRoot).map((f) => f.path);
    const slugs = extractWikilinks(parsed.body);
    const wikilinks = resolveWikilinks(slugs, allPaths);
    const title = extractTitle({
      frontmatter: parsed.frontmatter,
      body: parsed.body,
      relPath: requested,
    });
    const body: FileResponse = {
      path: requested,
      content: parsed.body,
      frontmatter:
        parsed.frontmatter !== null
          ? (parsed.frontmatter as unknown as Record<string, unknown>)
          : null,
      title,
      bytes: stat.size,
      mtime: new Date(stat.mtimeMs).toISOString(),
      wikilinks,
    };
    return c.json(body);
  });

  return route;
}

function listFiles(root: string): FileSummary[] {
  if (!existsSync(root)) return [];
  const out: FileSummary[] = [];
  const entries = readdirSync(root, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.md')) continue;
    const abs = join(entry.parentPath, entry.name);
    const relParts = abs.slice(root.length).split(sep).filter(Boolean);
    const relPath = relParts.join('/');
    const stat = statSync(abs);
    const raw = readFileSync(abs, 'utf8');
    const { frontmatter, body } = parseFrontmatter(raw);
    out.push({
      path: relPath,
      title: extractTitle({ frontmatter, body, relPath }),
      bytes: stat.size,
      mtime: new Date(stat.mtimeMs).toISOString(),
      tags: frontmatter?.tags ?? [],
    });
  }
  out.sort((a, b) => a.path.toLowerCase().localeCompare(b.path.toLowerCase()));
  return out;
}

function guardPath(root: string, requested: string): string | null {
  if (requested.startsWith('/')) return null;
  if (!requested.endsWith('.md')) return null;
  const abs = resolve(root, requested);
  if (abs !== root && !abs.startsWith(root + sep)) return null;
  return abs;
}
