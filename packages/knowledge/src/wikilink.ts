/**
 * Pulls every `[[slug]]` from a markdown body.
 *
 * Skips fenced code blocks (triple backtick) and inline code (single backtick).
 * Trims whitespace inside the brackets. Returns slugs in first-appearance
 * order, deduplicated. Empty / whitespace-only wikilinks are dropped.
 */
export function extractWikilinks(body: string): string[] {
  const stripped = stripCode(body);
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /\[\[([^[\]]*?)\]\]/g;
  let match: RegExpExecArray | null = re.exec(stripped);
  while (match !== null) {
    const slug = (match[1] ?? '').trim();
    if (slug.length > 0 && !seen.has(slug)) {
      seen.add(slug);
      out.push(slug);
    }
    match = re.exec(stripped);
  }
  return out;
}

function stripCode(body: string): string {
  const noFences = body.replace(/```[\s\S]*?```/g, '');
  return noFences.replace(/`[^`\n]*`/g, '');
}
