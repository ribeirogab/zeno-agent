// Spec 2026-05-22 (crons CLI-first) — atomic frontmatter rewrite helper.
// Reads CRON.md, applies a patch to the YAML data, re-serializes, writes
// to a `.tmp` sibling and renames into place (atomic on POSIX).

import { promises as fs } from 'node:fs';
import matter from 'gray-matter';

export async function rewriteFrontmatter(
  path: string,
  patch: (data: Record<string, unknown>) => Record<string, unknown>,
): Promise<void> {
  const raw = await fs.readFile(path, 'utf-8');
  const parsed = matter(raw);
  const newData = patch(parsed.data as Record<string, unknown>);
  const newBytes = matter.stringify(parsed.content, newData);
  const tmp = `${path}.tmp`;
  await fs.writeFile(tmp, newBytes, 'utf-8');
  await fs.rename(tmp, path);
}
