import type { JSX } from 'react';

export interface LosangoProps {
  size?: number;
  color?: string;
}

export function Losango({ size = 5, color = 'currentColor' }: LosangoProps): JSX.Element {
  const d = size * 2;
  return (
    <svg width={d} height={d} viewBox={`0 0 ${d} ${d}`} aria-hidden="true">
      <path
        d={`M${size} 0 L${d} ${size} L${size} ${d} L0 ${size} Z`}
        stroke={color}
        strokeWidth="1"
        fill="none"
      />
    </svg>
  );
}
