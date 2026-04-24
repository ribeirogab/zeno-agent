import { Chip } from '@zeno/ui';
import type { JSX } from 'react';
import type { LogFilters } from '@/lib/log-filters';

const CHIPS: Array<{ key: LogFilters['level']; label: string }> = [
  { key: 'all', label: 'ALL' },
  { key: 'info', label: 'INFO' },
  { key: 'warn', label: 'WARN' },
  { key: 'error', label: 'ERROR' },
];

export function LevelChips({
  value,
  onChange,
}: {
  value: LogFilters['level'];
  onChange: (level: LogFilters['level']) => void;
}): JSX.Element {
  return (
    <div className="flex items-center gap-1">
      {CHIPS.map((c) => (
        <Chip key={c.key} active={value === c.key} onClick={() => onChange(c.key)}>
          {c.label}
        </Chip>
      ))}
    </div>
  );
}
