import type { JSX } from 'react';
import type { TimeRangePreset } from '@/lib/log-filters';

const OPTIONS: Array<{ value: TimeRangePreset; label: string }> = [
  { value: '1h', label: 'last 1h' },
  { value: '24h', label: 'last 24h' },
  { value: '7d', label: 'last 7d' },
];

/**
 * Time-range chip cluster for the log filter row. Visual reference:
 * `apps/design/src/routes/dashboard/logs/index.tsx` — `<Chips>` over `RANGES`.
 */
export function TimeRangeSelect({
  value,
  onChange,
}: {
  value: TimeRangePreset;
  onChange: (v: TimeRangePreset) => void;
}): JSX.Element {
  return (
    <div className="flex gap-1">
      {OPTIONS.map((o) => (
        <RangeChip key={o.value} active={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </RangeChip>
      ))}
    </div>
  );
}

function RangeChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}): JSX.Element {
  if (active) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="px-3 py-1.5 bg-gold-soft border border-gold font-mono text-[10px] tracking-[0.12em] leading-3 uppercase text-gold"
      >
        {children}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-1.5 border border-border-subtle font-mono text-[10px] tracking-[0.12em] leading-3 uppercase text-text-secondary hover:text-text-primary hover:border-border-strong transition-colors duration-[120ms]"
    >
      {children}
    </button>
  );
}
