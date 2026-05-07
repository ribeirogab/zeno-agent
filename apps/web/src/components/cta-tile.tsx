import type { ReactNode } from 'react';

type CTATileProps = {
  href: string;
  icon: ReactNode;
  title: string;
  caption: string;
};

// Bottom-CTA tile. Vertical column: icon-square on top, title in
// Space Grotesk 15 600, caption in Space Grotesk 13 secondary.
// Subtle gold-tinted top inset shadow gives the tile its
// "instrument-panel" feel without competing with the hero accent.
export function CTATile({ href, icon, title, caption }: CTATileProps) {
  return (
    <a
      href={href}
      style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '24px',
        border: '1px solid var(--color-border-subtle)',
        backgroundColor: 'var(--color-panel)',
        borderRadius: '6px',
        textDecoration: 'none',
        boxShadow: 'inset 0 1px 0 rgba(217, 179, 98, 0.22), 0 1px 0 rgba(0, 0, 0, 0.2)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '32px',
          height: '32px',
          borderRadius: '4px',
          backgroundColor: 'var(--color-panel-2)',
          border: '1px solid var(--color-border-strong)',
        }}
      >
        {icon}
      </div>
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '15px',
          fontWeight: 600,
          color: 'var(--color-text-primary)',
          marginTop: '4px',
        }}
      >
        {title}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '13px',
          lineHeight: '20px',
          color: 'var(--color-text-secondary)',
        }}
      >
        {caption}
      </span>
    </a>
  );
}
