import { getLLMText } from '@/lib/llm-text';
import { source } from '@/lib/source';

export const revalidate = false;

export async function GET() {
  const pages = source.getPages();
  const chunks = await Promise.all(pages.map(getLLMText));
  return new Response(chunks.join('\n\n---\n\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
