import type { CSSProperties } from 'react';
import { PARTICLES } from '../lib/particles';

// Static particle field rendered as 20 absolutely-positioned dots,
// gently drifting + twinkling via the `particle-drift` keyframe in
// styles/index.css. Per-particle CSS variables drive the drift vector
// and the opacity peak so the field looks organic instead of synced.
// Marked `data-particle="true"` so structural tests can count them.
// `prefers-reduced-motion` disables the animation.
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
      {PARTICLES.map((particle, index) => {
        // Pseudo-random but deterministic drift per particle index. Each
        // dot gets a unique direction, distance, duration, and delay so
        // the field reads as ambient instead of choreographed.
        const angle = ((index * 47) % 360) * (Math.PI / 180);
        const distance = 8 + ((index * 3) % 14);
        const dx = `${(Math.cos(angle) * distance).toFixed(1)}px`;
        const dy = `${(Math.sin(angle) * distance - 6).toFixed(1)}px`;
        const duration = 6 + ((index * 1.3) % 6);
        const delay = (index * 0.41) % 7;

        const style: CSSProperties = {
          position: 'absolute',
          top: `${particle.top}px`,
          left: `${particle.left}px`,
          width: `${particle.size}px`,
          height: `${particle.size}px`,
          borderRadius: '9999px',
          backgroundColor: particle.color,
          opacity: particle.opacity,
          willChange: 'transform, opacity',
          animation: `particle-drift ${duration.toFixed(2)}s ease-in-out infinite`,
          animationDelay: `${delay.toFixed(2)}s`,
          ['--particle-opacity' as string]: String(particle.opacity),
          ['--particle-dx' as string]: dx,
          ['--particle-dy' as string]: dy,
        };

        return (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: positions are static and never reordered
            key={index}
            data-particle="true"
            style={style}
          />
        );
      })}
    </div>
  );
}
