import { Spark } from '@zeno/ui';
import type { JSX } from 'react';

interface StatTileProps {
  label: string;
  value: number | string;
  delta?: string;
  variant?: 'gold' | 'fail';
  spark?: number[];
  sparkColor?: string;
}

export function StatTile({
  label,
  value,
  delta,
  variant,
  spark,
  sparkColor,
}: StatTileProps): JSX.Element {
  return (
    <div className="zen-stat">
      <span className="zen-stat-label">{label}</span>
      <span className={`zen-stat-value ${variant ?? ''}`}>{value}</span>
      {delta && <span className="zen-stat-delta">{delta}</span>}
      {spark && (
        <span className="zen-stat-spark">
          <Spark data={spark} color={sparkColor ?? 'var(--color-gold)'} />
        </span>
      )}
    </div>
  );
}
