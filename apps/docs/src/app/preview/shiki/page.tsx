/**
 * Shiki theme preview. Renders five representative code blocks (TS, Bash,
 * JSON, TSX, Markdown) using the docs' MDX pipeline by linking to real docs
 * pages — the raw <pre> in this file would bypass shiki entirely.
 *
 * The real verification surface is `http://localhost:4242/install` (Bash +
 * Markdown), `/cli` (TS), and so on; this index lists those routes so the
 * maintainer can tab through them.
 */
import Link from 'next/link';

const SAMPLE_PAGES = [
  { href: '/install', langs: 'Bash, Markdown' },
  { href: '/cli', langs: 'Bash, TS-flavored snippets' },
  { href: '/connectors', langs: 'JSON, Bash' },
  { href: '/profile', langs: 'Bash' },
  { href: '/daily-ops', langs: 'Bash' },
];

export default function ShikiPreview() {
  return (
    <section>
      <h1>Shiki theme preview</h1>
      <p>
        The Imperial Terminal theme runs through the MDX pipeline; the only way to verify it
        end-to-end is on real docs pages. The list below covers the languages worth eyeballing.
      </p>
      <ul>
        {SAMPLE_PAGES.map((entry) => (
          <li key={entry.href}>
            <Link href={entry.href}>
              <code>{entry.href}</code>
            </Link>{' '}
            — {entry.langs}
          </li>
        ))}
      </ul>
      <p style={{ color: 'var(--color-fd-muted-foreground)' }}>
        Verify: editor background should be <code>#08090F</code> (Imperial canvas), keyword tokens
        (`if`, `return`, `export`, `import`) should paint Imperial gold (<code>#d9b362</code>).
      </p>
    </section>
  );
}
