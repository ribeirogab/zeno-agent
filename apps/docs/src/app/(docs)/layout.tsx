import { DocsLayout } from 'fumadocs-ui/layouts/notebook';
import type { ReactNode } from 'react';
import { Crest } from '@/components/crest';
import { source } from '@/lib/source';

/**
 * Docs chrome layout — sidebar tree + top nav + GitHub link. Wraps the
 * MDX catch-all route. Lives in the `(docs)` route group so it does NOT
 * apply to sibling routes like `/preview/*` and `/og` that need their own
 * (or no) layout.
 *
 * Route groups don't affect URLs — `(docs)/[[...slug]]/page.tsx` still
 * resolves to `/`, `/install`, etc.
 */
export default function DocsRouteLayout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={source.pageTree}
      nav={{
        mode: 'top',
        title: (
          <span className="inline-flex items-center gap-2 font-medium">
            <Crest size={20} />
            <span>zeno</span>
          </span>
        ),
        url: '/',
      }}
      githubUrl="https://github.com/ribeirogab/zeno-agent"
      themeSwitch={{ enabled: false }}
    >
      {children}
    </DocsLayout>
  );
}
