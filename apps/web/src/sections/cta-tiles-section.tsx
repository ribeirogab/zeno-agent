import { CTATile } from '../components/cta-tile';
import { DOCS_URL, GITHUB_URL, ROADMAP_URL } from '../lib/constants';

const GitHubIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--color-gold)" aria-hidden="true">
    <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.27-.01-1-.02-1.97-3.2.7-3.87-1.54-3.87-1.54-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.76 2.69 1.25 3.35.96.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.16 1.18a10.95 10.95 0 015.76 0c2.2-1.49 3.16-1.18 3.16-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14 0 1.55-.01 2.8-.01 3.18 0 .31.21.68.8.56C20.21 21.39 23.5 17.07 23.5 12 23.5 5.65 18.35.5 12 .5z" />
  </svg>
);

const DocsIcon = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="var(--color-gold)"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </svg>
);

const RoadmapIcon = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="var(--color-gold)"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="3 17 9 11 13 15 21 7" />
    <polyline points="14 7 21 7 21 14" />
  </svg>
);

// Bottom CTAs. Three exit paths in equal weight: GitHub, Docs, Roadmap.
// Order is fixed by the spec (and reflected by test assertions on link
// position).
export function CTATilesSection() {
  return (
    <section aria-label="cta" style={{ display: 'flex', gap: '16px', padding: '32px 192px 64px' }}>
      <CTATile
        href={GITHUB_URL}
        icon={GitHubIcon}
        title="GitHub"
        caption="Source code, issues, discussions."
      />
      <CTATile
        href={DOCS_URL}
        icon={DocsIcon}
        title="Docs"
        caption="Concepts, connector authoring, skills."
      />
      <CTATile
        href={ROADMAP_URL}
        icon={RoadmapIcon}
        title="Roadmap"
        caption="Now / next / later. Curated, no commitments past next."
      />
    </section>
  );
}
