import type { JSX } from 'react';
import type { LogFilters } from '@/lib/log-filters';

const CHIPS: Array<{ key: LogFilters['level']; label: string }> = [
  { key: 'all', label: 'all' },
  { key: 'info', label: 'info' },
  { key: 'warn', label: 'warn' },
  { key: 'error', label: 'error' },
];

/**
 * Lowercase chip cluster for the level filter. Visual reference:
 * `apps/design/src/routes/dashboard/logs/index.tsx` — `<Chips>` over `LEVELS`.
 */
export function LevelChips({
  value,
  onChange,
}: {
  value: LogFilters['level'];
  onChange: (level: LogFilters['level']) => void;
}): JSX.Element {
  return (
    <div className="flex gap-1">
      {CHIPS.map((c) => (
        <FilterChip key={c.key} active={value === c.key} onClick={() => onChange(c.key)}>
          {c.label}
        </FilterChip>
      ))}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: JSX.Element | string;
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
