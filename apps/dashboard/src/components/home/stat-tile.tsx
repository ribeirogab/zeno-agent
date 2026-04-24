import type { JSX } from 'react';
import { Spark } from '@zeno/ui';

interface StatTileProps {
  label: string;
  value: number | string;
  delta?: string;
  variant?: 'gold' | 'fail';
  spark?: number[];
  sparkColor?: string;
}

const variantClass: Record<string, string> = {
  gold: 'text-gold',
  fail: 'text-status-failed',
};

export function StatTile({
  label,
  value,
  delta,
  variant,
  spark,
  sparkColor,
}: StatTileProps): JSX.Element {
  return (
    <div className="relative flex flex-col gap-1.5 overflow-hidden px-5 py-4">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-tertiary">
        {label}
      </span>
      <span
        className={`font-serif text-[44px] leading-none tabular-nums lining-nums ${variant ? variantClass[variant] : 'text-text-primary'}`}
      >
        {value}
      </span>
      {delta && (
        <span className="font-mono text-[10px] text-text-tertiary">{delta}</span>
      )}
      {spark && (
        <span className="absolute right-3 bottom-3 opacity-45">
          <Spark data={spark} color={sparkColor ?? 'var(--color-gold)'} />
        </span>
      )}
    </div>
  );
}
