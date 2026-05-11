import Link from 'next/link';

const PREVIEW_ROUTES = [
  { href: '/preview/og', label: 'OG image grid (every doc slug + synthetic)' },
  { href: '/preview/not-found', label: '404 page' },
  { href: '/preview/callout', label: 'Callout palette (info/warn/error/success)' },
  { href: '/preview/shiki', label: 'Shiki theme (TS, Bash, JSON, TSX, Markdown)' },
  { href: '/preview/banner', label: 'Banner (isolated)' },
];

export default function PreviewIndex() {
  return (
    <main>
      <h1>Preview routes (dev-only)</h1>
      <p style={{ color: 'var(--color-fd-muted-foreground)' }}>
        These pages exist for visual review during development. They return 404 in production.
      </p>
      <ul>
        {PREVIEW_ROUTES.map((route) => (
          <li key={route.href}>
            <Link href={route.href}>{route.label}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
