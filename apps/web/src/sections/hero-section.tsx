import { HeroAura } from '../components/hero-aura';
import { HeroParticles } from '../components/hero-particles';
import { ZenoCrest } from '../components/zeno-crest';

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
    </section>
  );
}
