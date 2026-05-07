import { source } from '@/lib/source';

export const revalidate = false;

export function GET() {
  const lines: string[] = [];
  lines.push('# Zeno');
  lines.push('');
  lines.push('> Personal agent that operates across the apps you use.');
  lines.push('');
  lines.push('## Docs');
  lines.push('');

  for (const page of source.getPages()) {
    const description = page.data.description;
    if (!description) continue;
    lines.push(`- [${page.data.title}](${page.url}): ${description}`);
  }

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
