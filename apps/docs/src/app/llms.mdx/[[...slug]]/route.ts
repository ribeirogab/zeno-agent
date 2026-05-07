import { getLLMText } from '@/lib/llm-text';
import { source } from '@/lib/source';

export const revalidate = false;

export async function GET(_req: Request, { params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) {
    return new Response('Not Found', { status: 404 });
  }
  const text = await getLLMText(page);
  return new Response(text, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
}
