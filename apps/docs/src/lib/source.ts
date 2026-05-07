import { loader } from 'fumadocs-core/source';
import type { DocsCollectionEntry } from 'fumadocs-mdx/runtime/server';
import { docs as docsRaw } from '../../.source/server';

const docs = docsRaw as DocsCollectionEntry;

export const source = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
});
