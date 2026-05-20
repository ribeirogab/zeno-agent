/**
 * Parse an optional operator name from AGENTS.md.
 *
 * AGENTS.md is an operating manual, not a user bio, so a `name:` field
 * is optional. Operators who want their name surfaced in the dashboard
 * can add YAML frontmatter or a `Name: <value>` line; everyone else
 * gets null and the dashboard falls back to the profile slug.
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
export function parseAgentsMdName(content: string): string | null {
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
