import { Link } from '@tanstack/react-router';
import type { JSX } from 'react';

type Crumb = { label: string; to?: string; current?: boolean };

/**
 * Topstrip — sticky bar at the top of every authenticated dashboard page.
 * Faithful to Paper "zen-topstrip" pattern: breadcrumb left, ⌘K hint right.
 *
 * Crumbs with `to` render as links; the current crumb renders as plain text in gold.
 *
 * Imports `Link` directly from `@tanstack/react-router` — the typed router is
 * local to this app, so no Link-by-prop indirection needed (see spec 0031).
 */
export function DashboardTopstrip({ crumbs }: { crumbs: Crumb[] }): JSX.Element {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-3.5 px-6 py-2.5 bg-canvas/[0.92] backdrop-blur-md border-b border-border-subtle font-mono text-[11px] text-text-tertiary tracking-[0.06em]">
      <div className="flex gap-2 items-center text-text-secondary">
        <Link to="/" className="hover:text-text-primary transition-colors duration-[120ms]">
          zeno
        </Link>
        {crumbs.map((c, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: crumbs are static per route render, no reordering
          <span key={i} className="flex items-center gap-2">
            <span className="text-text-tertiary">/</span>
            {c.current ? (
              <span className="text-gold font-medium tracking-[0.06em]">{c.label}</span>
            ) : c.to ? (
              <Link
                to={c.to}
                className="hover:text-text-primary transition-colors duration-[120ms]"
              >
                {c.label}
              </Link>
            ) : (
              <span>{c.label}</span>
            )}
          </span>
        ))}
      </div>
      <span className="flex-1" />
      <button
        type="button"
        onClick={() => {
          // Synthetic keydown — picked up by <DashboardCommandPalette>'s listener.
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
        }}
        className="flex items-center gap-2 cursor-pointer text-text-tertiary hover:text-text-secondary transition-colors duration-[120ms]"
      >
        <span className="px-1.5 py-0.5 border border-border-subtle text-text-secondary text-[10px]">
          ⌘K
        </span>
        <span>command palette</span>
      </button>
    </div>
  );
}
