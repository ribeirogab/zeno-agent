import type { CSSProperties, ReactNode } from 'react';

type TextLinkProps = {
  href: string;
  children: ReactNode;
  /**
   * If true (default), opens the link in a new tab and adds the
   * standard noopener noreferrer rel. Pass `false` for in-page
   * anchor / hash links that should stay in the current tab.
   */
  external?: boolean;
  /** Inline style for layout (gap, font, padding, etc.). Color is owned by CSS. */
  style?: CSSProperties;
};

// Standardized link primitive for the landing. The color (default
// secondary, gold on hover) and the transition live in index.css under
// the `[data-text-link]` selector — keeping them in CSS means inline
// `style` props can carry layout without colliding with the hover rule.
//
// Defaults to `target="_blank" rel="noopener noreferrer"` because every
// link on the landing today goes to an external surface (GitHub, docs,
// roadmap, license).
export function TextLink({ href, children, external = true, style }: TextLinkProps) {
  const externalProps = external
    ? { target: '_blank' as const, rel: 'noopener noreferrer' as const }
    : {};
  return (
    <a href={href} data-text-link="" {...externalProps} style={style}>
      {children}
    </a>
  );
}
