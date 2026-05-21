import type { Frontmatter } from './frontmatter.js';

const MAX_CHARS = 120;

export function extractDescription(args: {
  frontmatter: Frontmatter | null;
  body: string;
}): string {
  const fmDesc = args.frontmatter?.description;
  if (fmDesc && fmDesc.length > 0) return fmDesc;

  for (const line of args.body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    if (trimmed.startsWith('#')) continue;
    return trimmed.length > MAX_CHARS ? `${trimmed.slice(0, MAX_CHARS)}…` : trimmed;
  }
  return '';
}
