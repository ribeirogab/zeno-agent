import { basename } from 'node:path';
import type { Frontmatter } from './frontmatter.js';

const H1_RE = /^#\s+(.+?)\s*$/m;

export function extractTitle(args: {
  frontmatter: Frontmatter | null;
  body: string;
  relPath: string;
}): string {
  const fmTitle = args.frontmatter?.title;
  if (fmTitle && fmTitle.length > 0) return fmTitle;

  const h1 = args.body.match(H1_RE);
  if (h1?.[1]) return h1[1];

  return basename(args.relPath, '.md');
}
