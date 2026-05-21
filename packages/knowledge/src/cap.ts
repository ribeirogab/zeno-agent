const FILE_LINE_RE = /^\s*-\s+\[[^\]]+\]\(/gm;

export interface CapResult {
  content: string;
  truncated: boolean;
  originalBytes: number;
  droppedCount: number;
}

export function applyCap(markdown: string, capBytes: number): CapResult {
  const originalBytes = Buffer.byteLength(markdown, 'utf8');
  if (originalBytes <= capBytes) {
    return { content: markdown, truncated: false, originalBytes, droppedCount: 0 };
  }

  const totalFiles = countFileLines(markdown);
  const sliced = markdown.slice(0, capBytes);
  const lastNewline = sliced.lastIndexOf('\n');
  const truncated = lastNewline > 0 ? sliced.slice(0, lastNewline) : sliced;
  const keptFiles = countFileLines(truncated);
  const droppedCount = Math.max(totalFiles - keptFiles, 0);
  const footer = `\n\n(${droppedCount} files truncated — use Read tool with \`ls /app/knowledge\` for full list)`;

  return {
    content: `${truncated}${footer}`,
    truncated: true,
    originalBytes,
    droppedCount,
  };
}

function countFileLines(s: string): number {
  return (s.match(FILE_LINE_RE) ?? []).length;
}
