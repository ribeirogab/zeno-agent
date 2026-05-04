/**
 * Parse the operator name from USER.md.
 *
 * Two acceptable formats:
 *
 * 1. YAML frontmatter:
 *    ---
 *    name: Alex
 *    ---
 *
 * 2. Markdown body anywhere in the file:
 *    `Name: Alex` or `**Name:** Alex` (case-insensitive).
 *
 * Returns null when neither format matches.
 */
export function parseUserMdName(content: string): string | null {
  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  const frontmatterBody = fm?.[1];
  if (frontmatterBody) {
    const nameMatch = frontmatterBody.match(/^name:\s*(.+?)\s*$/m);
    const fmName = nameMatch?.[1]?.trim();
    if (fmName) return fmName;
  }

  const bodyMatch = content.match(/^[\s>\-*]*\**\s*name\s*\**\s*:\s*(.+?)\s*$/im);
  const bodyName = bodyMatch?.[1]
    ?.trim()
    ?.replace(/^[*_`\s]+|[*_`\s]+$/g, '')
    ?.trim();
  if (bodyName) return bodyName;

  return null;
}
