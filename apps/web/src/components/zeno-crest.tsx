type ZenoCrestProps = {
  size?: number;
};

// Diamond Z crest, copied verbatim from the approved Paper artboard
// `zeno-agent` doc, node `G7-0`. The SVG is intrinsically 120x120; the
// `size` prop scales it via width/height. Stroke and fill colors are
// hard-coded to the Imperial Terminal gold palette (DESIGN.md).
export function ZenoCrest({ size = 96 }: ZenoCrestProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Zeno crest"
      style={{ flexShrink: 0 }}
    >
      <path d="M60 6 L114 60 L60 114 L6 60 Z" stroke="#D9B362" strokeWidth="2.5" fill="none" />
      <path d="M60 14 L106 60 L60 106 L14 60 Z" stroke="#D9B36266" fill="none" />
      <path d="M60 22 L98 60 L60 98 L22 60 Z" stroke="#D9B36233" strokeWidth="0.75" fill="none" />
      <g fill="#D9B362">
        <rect x="36" y="42" width="48" height="8" />
        <polygon points="76,50 84,50 44,70 36,70" />
        <rect x="36" y="70" width="48" height="8" />
      </g>
      <circle cx="60" cy="6" r="2" fill="#D9B362" />
      <circle cx="60" cy="114" r="2" fill="#D9B362" />
      <circle cx="6" cy="60" r="1.5" fill="#D9B36280" />
      <circle cx="114" cy="60" r="1.5" fill="#D9B36280" />
    </svg>
  );
}
