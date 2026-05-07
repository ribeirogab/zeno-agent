import type { InferPageType } from 'fumadocs-core/source';
import type { source } from '@/lib/source';

type Page = InferPageType<typeof source>;

/**
 * Returns the page's markdown body without MDX-only constructs (JSX components, imports).
 * Used by /llms-full.txt and /llms.mdx/<slug>.
 *
 * Fumadocs's `getText("processed")` returns the post-MDX-pipeline markdown when the source
 * collection enables `includeProcessedMarkdown`; falling back to `"raw"` returns the original
 * source. We prefer "raw" here because the placeholder content has no remark/rehype
 * transformations the agent needs.
 */
export async function getLLMText(page: Page): Promise<string> {
  const title = page.data.title;
  const description = page.data.description ?? '';
  const url = page.url;
  const body = await page.data.getText('raw');
  return `# ${title}\n\n> ${description}\n\nSource: ${url}\n\n${body}`.trim();
}
