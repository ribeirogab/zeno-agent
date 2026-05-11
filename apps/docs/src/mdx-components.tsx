import { File, Files, Folder } from 'fumadocs-ui/components/files';
import { ImageZoom } from 'fumadocs-ui/components/image-zoom';
import { InlineTOC } from 'fumadocs-ui/components/inline-toc';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import { TypeTable } from 'fumadocs-ui/components/type-table';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';

/**
 * Single source of truth for the MDX component map. The page renderer passes
 * the result to `<MDX components={...} />` so every default Fumadocs primitive
 * (code-block copy button, heading anchor, table chrome, etc.) lights up — and
 * the extra primitives are available to MDX authors without per-page imports.
 *
 * Authors using `<InlineTOC items={...}>` still need to pass `items` (Fumadocs
 * does not provide them automatically); the export only makes the component
 * available in the MDX scope.
 *
 * The cast to `MDXComponents` is a workaround: Fumadocs's `defaultMdxComponents.img`
 * declares `sizes?: string` (excluding `undefined`), which collides with the
 * standard `ImgHTMLAttributes` shape under `exactOptionalPropertyTypes`. Both
 * sides are runtime-compatible — the cast just bypasses the strict
 * structural check.
 */
export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    InlineTOC,
    Tab,
    Tabs,
    File,
    Files,
    Folder,
    TypeTable,
    ImageZoom,
    ...components,
  } as MDXComponents;
}
