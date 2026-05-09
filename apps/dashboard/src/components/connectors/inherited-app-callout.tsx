/**
 * Inherited app callout — shown on github-app-* connector detail pages
 * (per spec 0043 C10 design). Spec 0045.
 *
 * The callout is a gold-bordered strip telling the user that App credentials
 * (App ID + PEM) live on the parent connector_apps row, NOT on this
 * installation. Manage credentials via the App detail page.
 */

import { Link } from '@tanstack/react-router';
import type { JSX } from 'react';

export function InheritedAppCallout(): JSX.Element {
  return (
    <div className="flex items-start gap-3 px-4 py-3 bg-gold/10 border border-gold-line border-l-2 border-l-gold">
      <span className="font-mono text-xs leading-4 text-gold mt-0.5">i</span>
      <div className="flex-1 flex flex-col gap-1">
        <span className="font-mono text-[11px] tracking-[0.06em] leading-[14px] uppercase text-gold">
          credentials inherited from github app
        </span>
        <span className="font-sans text-[13px] leading-5 text-text-primary">
          The App ID and PEM are shared across all installations and live on the parent App row. To
          uninstall the App, open the{' '}
          <Link to="/connectors" className="text-gold underline">
            GitHub App detail page ↗
          </Link>
          .
        </span>
      </div>
    </div>
  );
}
