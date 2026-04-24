import type { JSX } from 'react';

export interface SparkProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}

export function Spark({ data, width = 60, height = 18, color = 'var(--color-gold)' }: SparkProps): JSX.Element {
  const max = Math.max(...data, 1);
  const step = width / (data.length - 1);
  const pts = data
    .map((v, i) => `${(i * step).toFixed(1)},${(height - (v / max) * height).toFixed(1)}`)
    .join(' ');

  return (
    <svg width={width} height={height} aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1" strokeOpacity="0.7" />
    </svg>
  );
}
