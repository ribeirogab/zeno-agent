/**
 * Convert GitHub-flavored markdown (what Claude emits) into Slack's mrkdwn.
 *
 * Slack's mrkdwn differs from standard markdown in a few ways:
 *   - bold is *single* asterisks, not double (`*bold*` vs `**bold**`)
 *   - italic is underscores (`_italic_`)
 *   - links are `<url|text>`, not `[text](url)`
 *   - headings don't exist — we render them as bold on their own line
 *
 * We intentionally do NOT touch:
 *   - fenced code blocks (```…```) — identical in both formats
 *   - inline code (`…`) — identical
 *   - bullet lists (`- `) — Slack accepts them
 *   - blockquotes (`> `) — identical
 */
export function toSlackMrkdwn(text: string): string {
  // Walk the text line by line, skipping content inside fenced code blocks so
  // formatting markers in example code don't get rewritten.
  const lines = text.split('\n');
  let inFence = false;
  const out: string[] = [];
  for (const line of lines) {
    if (line.startsWith('```')) {
      inFence = !inFence;
      out.push(line);
      continue;
    }
    out.push(inFence ? line : transformLine(line));
  }
  return out.join('\n');
}

function transformLine(line: string): string {
  // Protect inline code spans so their contents aren't rewritten.
  const protectedSpans: string[] = [];
  const PLACEHOLDER = '@@ZENO_CODE@@';
  let working = line.replace(/`[^`]+`/g, (match) => {
    const idx = protectedSpans.length;
    protectedSpans.push(match);
    return `${PLACEHOLDER}${idx}${PLACEHOLDER}`;
  });

  // Heading → bold on its own line (Slack has no heading support).
  working = working.replace(/^#{1,6}\s+(.+)$/, '*$1*');

  // Links [text](url) → <url|text>. Keep it simple: no nested brackets.
  working = working.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<$2|$1>');

  // Bold: **text** or __text__ → *text*. Run the double-delimiter forms first
  // so the subsequent italic pass doesn't mangle them.
  working = working.replace(/\*\*([^*\n]+?)\*\*/g, '*$1*');
  working = working.replace(/__([^_\n]+?)__/g, '*$1*');

  // Single-asterisk italic (`*italic*`) collides with Slack bold, so we leave
  // it alone. Authors who want italics should use `_italic_`, which already
  // renders correctly in Slack.

  // Restore protected inline code spans.
  working = working.replace(
    new RegExp(`${PLACEHOLDER}(\\d+)${PLACEHOLDER}`, 'g'),
    (_, i) => protectedSpans[Number(i)] ?? '',
  );

  return working;
}
