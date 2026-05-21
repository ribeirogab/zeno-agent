import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { applyCap, renderIndex, scanKnowledge } from '@zeno/knowledge';
import { KNOWLEDGE_ROOT } from './paths.js';

const CAP_BYTES = 8 * 1024;

export type LoadSource = 'absent' | 'index' | 'scan-missing' | 'scan-stale';

export interface LoadResult {
  content: string;
  source: LoadSource;
  fileCount: number;
  truncated: boolean;
  originalBytes: number;
  droppedCount: number;
  stalestMtime: number | null;
}

export function loadKnowledgeBlock(rootOverride?: string): LoadResult {
  const root = rootOverride ?? KNOWLEDGE_ROOT;

  if (!existsSync(root)) {
    return emptyResult('absent');
  }

  const indexPath = join(root, '_index.md');
  const hasIndex = existsSync(indexPath);
  const stalest = newestMarkdownMtime(root);
  const indexMtime = hasIndex ? statSync(indexPath).mtimeMs : 0;
  const stale = hasIndex && stalest !== null && stalest > indexMtime;

  if (hasIndex && !stale) {
    const raw = readFileSync(indexPath, 'utf8');
    const cap = applyCap(raw, CAP_BYTES);
    return {
      content: cap.content,
      source: 'index',
      fileCount: countFilesInTree(root),
      truncated: cap.truncated,
      originalBytes: cap.originalBytes,
      droppedCount: cap.droppedCount,
      stalestMtime: stalest,
    };
  }

  const files = scanKnowledge(root);
  const rendered = renderIndex(files, { generatedAt: new Date() });
  const cap = applyCap(rendered.markdown, CAP_BYTES);
  return {
    content: cap.content,
    source: hasIndex ? 'scan-stale' : 'scan-missing',
    fileCount: files.length,
    truncated: cap.truncated,
    originalBytes: cap.originalBytes,
    droppedCount: cap.droppedCount,
    stalestMtime: stalest,
  };
}

function emptyResult(source: LoadSource): LoadResult {
  return {
    content: '',
    source,
    fileCount: 0,
    truncated: false,
    originalBytes: 0,
    droppedCount: 0,
    stalestMtime: null,
  };
}

function newestMarkdownMtime(root: string): number | null {
  let newest: number | null = null;
  for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.md')) continue;
    if (entry.name === '_index.md') continue;
    const segments = entry.parentPath.slice(root.length).split(sep);
    if (segments.some((s) => s.startsWith('_'))) continue;
    if (entry.name.startsWith('_')) continue;
    const m = statSync(join(entry.parentPath, entry.name)).mtimeMs;
    if (newest === null || m > newest) newest = m;
  }
  return newest;
}

function countFilesInTree(root: string): number {
  let count = 0;
  for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.md')) continue;
    if (entry.name.startsWith('_')) continue;
    const segments = entry.parentPath.slice(root.length).split(sep);
    if (segments.some((s) => s.startsWith('_'))) continue;
    count++;
  }
  return count;
}
