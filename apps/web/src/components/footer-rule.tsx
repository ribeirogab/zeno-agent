// Thin horizontal gold gradient rule that floats absolutely at the
// top of the footer (fade gold -> transparent at the edges, peak at
// 50% width). Replaces a flat 1px border-top with something that
// reads as a finishing detail rather than a section divider.
export function FooterRule() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '1px',
        backgroundImage:
          'linear-gradient(90deg, rgba(217, 179, 98, 0) 0%, rgba(217, 179, 98, 0.4) 50%, rgba(217, 179, 98, 0) 100%)',
        pointerEvents: 'none',
      }}
    />
  );
}
