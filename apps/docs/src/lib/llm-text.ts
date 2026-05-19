import type { InferPageType } from 'fumadocs-core/source';
import type { source } from '@/lib/source';

type Page = InferPageType<typeof source>;

/**
 * Returns the page's markdown body without MDX-only constructs (JSX components, imports).
 * Used by /llms-full.txt and /llms.mdx/<slug>.
 *
 * **Reads `getText('processed')`, not `'raw'`.** `'raw'` reads the original `.mdx` file
 * from the filesystem; Cloudflare Workers has no FS, so the production runtime 500s.
 * `'processed'` returns the bundled `_markdown` field that `includeProcessedMarkdown`
 * (set in `source.config.ts`) ships inside the page data — works in both Node.js and
 * Workers runtimes. Captured in
 * `.vault/learnings/fumadocs-mdx-source-postinstall.md`.
 */
export async function getLLMText(page: Page): Promise<string> {
  const title = page.data.title;
  const description = page.data.description ?? '';
  const url = page.url;
  const body = await page.data.getText('processed');
  return `# ${title}\n\n> ${description}\n\nSource: ${url}\n\n${body}`.trim();
}
