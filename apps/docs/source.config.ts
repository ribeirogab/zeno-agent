import { type DocsCollection, defineConfig, defineDocs } from 'fumadocs-mdx/config';

export const docs: DocsCollection = defineDocs({
  dir: 'content/docs',
  docs: {
    // Bundle the processed markdown into each page's data so /llms.mdx/<slug>
    // can read it without touching the file system. CF Workers has no FS, so
    // `page.data.getText('raw')` 500s in production. The processed markdown
    // is exported via `_markdown` on the page data.
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
});

export default defineConfig();
