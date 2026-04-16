import type { JSX } from 'react';
import { cn } from '@/lib/utils';
import type { LogFilters } from '@/lib/log-filters';

const CHIPS: Array<{ key: LogFilters['level']; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'info', label: 'Info' },
  { key: 'warn', label: 'Warn' },
  { key: 'error', label: 'Error' },
];

export function LevelChips({
  value,
  onChange,
}: {
  value: LogFilters['level'];
  onChange: (level: LogFilters['level']) => void;
}): JSX.Element {
  return (
    <div className="flex items-center gap-0.5 rounded-md bg-panel p-0.5">
      {CHIPS.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => onChange(c.key)}
          className={cn(
            'rounded-md px-3 py-1.5 text-xs font-medium uppercase tracking-wider transition-colors',
            value === c.key
              ? 'bg-canvas text-text-primary'
              : 'text-text-secondary hover:text-text-primary',
          )}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}
