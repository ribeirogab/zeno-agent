'use client';

import { buttonVariants } from 'fumadocs-ui/components/ui/button';
import { useSearchContext } from 'fumadocs-ui/contexts/search';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { Crest } from '@/components/crest';

/**
 * Custom 404 — Imperial Terminal voice. Crest + factual headline + search
 * trigger + single home link. No oops/emoji/large 404 numeral, no hard-coded
 * shortcut links (those rot when pages get renamed).
 *
 * Triggers the Fumadocs search dialog via `setOpenSearch` from the context
 * supplied by `RootProvider` in `app/layout.tsx`. When search is disabled
 * (unlikely here — the scaffold spec wires Fumadocs's Orama search), the
 * trigger button is hidden so the page stays coherent.
 */
export default function NotFound() {
  const { enabled, setOpenSearch } = useSearchContext();

  return (
    <main
      style={{
        minHeight: '60vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1.5rem',
        textAlign: 'center',
        padding: '4rem 1rem',
      }}
    >
      <Crest size={64} />
      <h1 style={{ fontSize: '2rem', fontWeight: 600, margin: 0 }}>Page not found</h1>
      <p
        style={{
          color: 'var(--color-fd-muted-foreground)',
          maxWidth: '36ch',
          margin: 0,
        }}
      >
        The page you requested does not exist or has been moved. Try search or head back to the docs
        home.
      </p>
      {enabled ? (
        <button
          type="button"
          onClick={() => setOpenSearch(true)}
          className={buttonVariants({ color: 'secondary', size: 'sm', className: 'gap-2' })}
        >
          <Search size={14} aria-hidden />
          <span>Search docs</span>
        </button>
      ) : null}
      <Link href="/" style={{ color: 'var(--color-fd-foreground)', textDecoration: 'underline' }}>
        ← Back to docs
      </Link>
    </main>
  );
}
