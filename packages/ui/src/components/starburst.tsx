import type { JSX, SVGProps } from 'react';

export interface StarburstProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

/**
 * Coral starburst glyph — Zeno's single brand moment (matches the Claude app
 * aesthetic). Use as inline accent next to Instrument Serif headlines, or at
 * small size as a sidebar mark.
 */
export function Starburst({ size = 24, className, ...props }: StarburstProps): JSX.Element {
  const cx = 12;
  const cy = 12;
  const raysShort = [0, 45, 90, 135, 180, 225, 270, 315];
  const raysLong = [22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5];
  const shortLen = 4.2;
  const longLen = 7;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <title>Zeno starburst</title>
      {raysLong.map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const x2 = cx + Math.cos(rad) * longLen;
        const y2 = cy + Math.sin(rad) * longLen;
        return <line key={`l-${deg}`} x1={cx} y1={cy} x2={x2} y2={y2} />;
      })}
      {raysShort.map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const x2 = cx + Math.cos(rad) * shortLen;
        const y2 = cy + Math.sin(rad) * shortLen;
        return <line key={`s-${deg}`} x1={cx} y1={cy} x2={x2} y2={y2} />;
      })}
      <circle cx={cx} cy={cy} r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}
