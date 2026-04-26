import { Spark } from '@zeno/ui';
import type { JSX } from 'react';

export interface StatTileProps {
  /** Top label, e.g. "active crons" */
  label: string;
  /** Big serif value, e.g. "3" */
  value: string | number;
  /** Bottom mono delta, e.g. "+0 since yesterday" */
  delta?: string;
  /** Optional sparkline points (rendered absolutely bottom-right). */
  spark?: number[];
  /** Sparkline color override. Defaults to gold. */
  sparkColor?: string;
  /** Render the value in gold instead of primary text. */
  gold?: boolean;
}

/**
 * Compact stat tile shown in the home grid (4-up). Visual reference:
 * `apps/design/src/routes/dashboard/home/index.tsx` — `<StatTile>`.
 */
export function StatTile({
  label,
  value,
  delta,
  spark,
  sparkColor,
  gold,
}: StatTileProps): JSX.Element {
  return (
    <div className="bg-panel px-5 pt-5 pb-[18px] flex flex-col gap-2 relative overflow-hidden transition-colors hover:bg-panel-2">
      <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-text-tertiary">
        {label}
      </span>
      <span
        className={`font-serif text-[44px] font-normal leading-none tracking-[-0.02em] ${
          gold ? 'text-gold' : 'text-text-primary'
        }`}
      >
        {value}
      </span>
      {delta ? (
        <span className="font-mono text-[10px] text-text-tertiary tracking-[0.06em]">{delta}</span>
      ) : null}
      {spark && spark.length > 0 ? (
        <span className="absolute right-3.5 bottom-3.5 opacity-45">
          <Spark data={spark} color={sparkColor ?? 'var(--color-gold)'} />
        </span>
      ) : null}
    </div>
  );
}
