import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';
import { source } from '@/lib/source';

/**
 * Per-slug OG image route. Reads `title` and `description` from frontmatter,
 * renders them on the Imperial Terminal palette with a Crest mark + brand
 * bar. 1200×630 (standard OG / Twitter card size).
 *
 * This route lives outside the `[[...slug]]` catch-all because Turbopack
 * disallows static `opengraph-image` siblings of an optional catch-all
 * (the catch-all must be the last segment). The docs page's
 * `generateMetadata` wires `openGraph.images` to `/og?slug=<slug>` so
 * social cards still resolve to per-slug images.
 *
 * Workers cannot fetch remote fonts at runtime, so we rely on the system
 * sans fallback — the Imperial palette carries the brand.
 */
const SIZE = { width: 1200, height: 630 };

export async function GET(request: NextRequest) {
  const slugParam = request.nextUrl.searchParams.get('slug') ?? '';
  const slugSegments = slugParam ? slugParam.split('/').filter(Boolean) : undefined;
  const page = source.getPage(slugSegments);

  const title = page?.data.title ?? 'Zeno';
  const description = page?.data.description ?? '';

  return new ImageResponse(
    <div
      style={{
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: '#08090F',
        padding: '64px',
        color: '#e8eaf5',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <svg
          width="48"
          height="48"
          viewBox="0 0 120 120"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-label="Zeno crest"
        >
          <path d="M60 6 L114 60 L60 114 L6 60 Z" stroke="#d9b362" strokeWidth="3" fill="none" />
          <g fill="#d9b362">
            <rect x="36" y="42" width="48" height="8" />
            <polygon points="76,50 84,50 44,70 36,70" />
            <rect x="36" y="70" width="48" height="8" />
          </g>
        </svg>
        <span style={{ fontSize: '28px', fontWeight: 600, color: '#e8eaf5' }}>zeno</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ fontSize: '72px', fontWeight: 700, color: '#e8eaf5', lineHeight: 1.1 }}>
          {title}
        </div>
        {description ? (
          <div style={{ fontSize: '32px', color: '#8a8fab', lineHeight: 1.3, maxWidth: '90%' }}>
            {description}
          </div>
        ) : null}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: '#4b4f66',
          fontSize: '22px',
        }}
      >
        <span>docs.zeno-agent.dev</span>
        <span style={{ color: '#d9b362' }}>Personal agent · Self-hosted</span>
      </div>
    </div>,
    SIZE,
  );
}
