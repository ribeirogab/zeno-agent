import { PARTICLES } from '../lib/particles';

// Static particle field rendered as 20 absolutely-positioned dots.
// Marked `data-particle="true"` so structural tests can count them.
// Animation is intentionally out of scope; an animated <canvas> field
// is a follow-up spec.
export function HeroParticles() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
      }}
    >
      {PARTICLES.map((particle, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: positions are static and never reordered
          key={index}
          data-particle="true"
          style={{
            position: 'absolute',
            top: `${particle.top}px`,
            left: `${particle.left}px`,
            width: `${particle.size}px`,
            height: `${particle.size}px`,
            borderRadius: '9999px',
            backgroundColor: particle.color,
            opacity: particle.opacity,
          }}
        />
      ))}
    </div>
  );
}
