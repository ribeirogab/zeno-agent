// Atmospheric background layers for the hero, all rendered via a single
// element with a multi-layer `background-image`. Layers, in stacking order
// (top first):
//   1. primary gold radial glow (warm spot above the crest)
//   2. asymmetric secondary gold glow (top-right ambient)
//   3. asymmetric tertiary cool blue ambient haze (bottom-left, < 0.05 alpha
//      so it does not violate the single-accent rule)
//   4. phosphor scan lines (CRT feel, ~0.018 opacity)
//
// Tuning copied verbatim from the approved Paper artboard.
export function HeroAura() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        backgroundImage: [
          'radial-gradient(ellipse 800px 420px at 50% 35%, rgba(217, 179, 98, 0.13) 0%, rgba(217, 179, 98, 0.05) 35%, rgba(8, 9, 15, 0) 75%)',
          'radial-gradient(circle 400px at 88% 20%, rgba(217, 179, 98, 0.06) 0%, rgba(8, 9, 15, 0) 100%)',
          'radial-gradient(circle 400px at 12% 80%, rgba(122, 166, 232, 0.035) 0%, rgba(8, 9, 15, 0) 100%)',
          'repeating-linear-gradient(0deg, transparent 0px, transparent 3px, rgba(217, 179, 98, 0.018) 3px, rgba(217, 179, 98, 0.018) 4px)',
        ].join(', '),
      }}
    />
  );
}
