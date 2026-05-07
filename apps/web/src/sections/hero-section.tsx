import { HeroAura } from '../components/hero-aura';
import { HeroParticles } from '../components/hero-particles';
import { TextLink } from '../components/text-link';
import { ZenoCrest } from '../components/zeno-crest';
import { DOCS_URL, GITHUB_URL, ROADMAP_URL } from '../lib/constants';

// Hero. Compact, centered, atmospheric. Order top-to-bottom:
//   crest -> mono caps tagline -> Fraunces "Zeno" with gold gradient
//   text fill -> Space Grotesk sub-pitch.
//
// HeroAura + HeroParticles render absolutely behind the content.
export function HeroSection() {
  return (
    <section
      aria-label="hero"
      style={{
        position: 'relative',
        overflow: 'hidden',
        padding: '120px 48px 80px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '24px',
        textAlign: 'center',
      }}
    >
      <HeroAura />
      <HeroParticles />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <ZenoCrest size={96} />
      </div>
      <span
        style={{
          position: 'relative',
          zIndex: 1,
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          fontWeight: 600,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: 'var(--color-text-secondary)',
        }}
      >
        Personal agent that gets the work done
      </span>
      <h1
        style={{
          position: 'relative',
          zIndex: 1,
          fontFamily: 'var(--font-serif)',
          fontWeight: 500,
          fontSize: '48px',
          lineHeight: '52px',
          letterSpacing: '-0.03em',
          margin: 0,
          color: 'var(--color-gold)',
          backgroundImage: 'linear-gradient(135deg, #f0cc7a 0%, #d9b362 35%, #8a6d2e 100%)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}
      >
        Zeno
      </h1>
      <p
        style={{
          position: 'relative',
          zIndex: 1,
          fontFamily: 'var(--font-sans)',
          fontWeight: 400,
          fontSize: '18px',
          lineHeight: '28px',
          color: 'var(--color-text-secondary)',
          margin: 0,
          maxWidth: '56ch',
        }}
      >
        Self-hosted, single-user agent that operates across the apps you already use — Slack,
        GitHub, Linear — by composing the connectors you install.
      </p>
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: '24px',
          flexWrap: 'wrap',
          justifyContent: 'center',
          paddingTop: '12px',
        }}
      >
        <TextLink href={GITHUB_URL} style={heroLinkStyle}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="var(--color-text-primary)"
            aria-hidden="true"
            style={{ flexShrink: 0 }}
          >
            <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.27-.01-1-.02-1.97-3.2.7-3.87-1.54-3.87-1.54-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.76 2.69 1.25 3.35.96.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.16 1.18a10.95 10.95 0 015.76 0c2.2-1.49 3.16-1.18 3.16-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14 0 1.55-.01 2.8-.01 3.18 0 .31.21.68.8.56C20.21 21.39 23.5 17.07 23.5 12 23.5 5.65 18.35.5 12 .5z" />
          </svg>
          GitHub
        </TextLink>
        <span aria-hidden="true" style={dotSeparatorStyle} />
        <TextLink href={DOCS_URL} style={heroLinkStyle}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-text-primary)"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            style={{ flexShrink: 0 }}
          >
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
          Docs
        </TextLink>
        <span aria-hidden="true" style={dotSeparatorStyle} />
        <TextLink href={ROADMAP_URL} style={heroLinkStyle}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-text-primary)"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            style={{ flexShrink: 0 }}
          >
            <polyline points="3 17 9 11 13 15 21 7" />
            <polyline points="14 7 21 7 21 14" />
          </svg>
          Roadmap
        </TextLink>
      </div>
    </section>
  );
}

// Layout-only inline style. Color, hover, transition, text-decoration
// all owned by the `[data-text-link]` rule in index.css.
const heroLinkStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  fontFamily: 'var(--font-mono)',
  fontSize: '12px',
  fontWeight: 500,
  letterSpacing: '0.04em',
};

const dotSeparatorStyle: React.CSSProperties = {
  width: '3px',
  height: '3px',
  borderRadius: '9999px',
  backgroundColor: 'var(--color-text-tertiary)',
};
