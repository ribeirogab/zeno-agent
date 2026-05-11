import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * Dev-only sandbox for visually verifying components in apps/docs.
 * Production Cloudflare Worker serves notFound() for all /preview/* paths.
 *
 * Routes under this layout exist only to let the maintainer eyeball component
 * variants (OG image, 404, callout palette, shiki theme, banner) without
 * shipping mock pages to docs.zeno-agent.dev.
 */
export default function PreviewLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV !== 'development') {
    notFound();
  }

  return <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>{children}</div>;
}
