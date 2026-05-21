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

/**
 * Maps each slug to a single resolved relative path or `null`.
 *
 * Resolution rules mirror @zeno/knowledge resolveRelated:
 *  - Bare `foo` matches any `.md` whose basename is `foo.md`. Ambiguous → null.
 *  - Prefixed `dir/foo` matches any `.md` that starts with `dir/` and whose
 *    basename is `foo.md`. Ambiguous → null. Exact-prefix only — no fuzzy.
 *
 * Always returns one key per input slug (no slug is dropped).
 */
export function resolveWikilinks(
  slugs: string[],
  allPaths: string[],
): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const slug of slugs) {
    const matches = candidatesForSlug(allPaths, slug);
    out[slug] = matches.length === 1 ? (matches[0] ?? null) : null;
  }
  return out;
}

function candidatesForSlug(allPaths: string[], slug: string): string[] {
  if (slug.includes('/')) {
    const lastSlash = slug.lastIndexOf('/');
    const dirPrefix = slug.slice(0, lastSlash);
    const baseName = slug.slice(lastSlash + 1);
    const target = `${baseName}.md`;
    return allPaths.filter((p) => {
      if (!p.startsWith(`${dirPrefix}/`)) return false;
      const parts = p.split('/');
      const last = parts[parts.length - 1] ?? '';
      return last === target;
    });
  }
  const target = `${slug}.md`;
  return allPaths.filter((p) => p === target || p.endsWith(`/${target}`));
}
