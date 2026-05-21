export interface RelatedQuery {
  file: string;
  slug: string;
}

export interface RelatedResolution {
  resolved: Map<string, Map<string, string>>;
  unresolved: RelatedQuery[];
}

export function resolveRelated(allPaths: string[], queries: RelatedQuery[]): RelatedResolution {
  const resolved = new Map<string, Map<string, string>>();
  const unresolved: RelatedQuery[] = [];

  for (const q of queries) {
    const matches = candidatesForSlug(allPaths, q.slug);
    if (matches.length === 1) {
      const match = matches[0];
      if (match === undefined) continue;
      let perFile = resolved.get(q.file);
      if (!perFile) {
        perFile = new Map();
        resolved.set(q.file, perFile);
      }
      perFile.set(q.slug, match);
    } else {
      unresolved.push(q);
    }
  }

  return { resolved, unresolved };
}

function candidatesForSlug(allPaths: string[], slug: string): string[] {
  if (slug.includes('/')) {
    const lastSlash = slug.lastIndexOf('/');
    const dirPrefix = slug.slice(0, lastSlash);
    const baseName = slug.slice(lastSlash + 1);
    const targetBasename = `${baseName}.md`;
    return allPaths.filter((p) => {
      if (!p.startsWith(`${dirPrefix}/`)) return false;
      const parts = p.split('/');
      const last = parts[parts.length - 1] ?? '';
      return last === targetBasename;
    });
  }
  const target = `${slug}.md`;
  return allPaths.filter((p) => p === target || p.endsWith(`/${target}`));
}
