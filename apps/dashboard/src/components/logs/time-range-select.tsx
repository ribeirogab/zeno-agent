import type { JSX } from 'react';
import type { TimeRangePreset } from '@/lib/log-filters';

const OPTIONS: Array<{ value: TimeRangePreset; label: string }> = [
  { value: '1h', label: 'Last 1h' },
  { value: '24h', label: 'Last 24h' },
  { value: '7d', label: 'Last 7d' },
];

export function TimeRangeSelect({
  value,
  onChange,
}: {
  value: TimeRangePreset;
  onChange: (v: TimeRangePreset) => void;
}): JSX.Element {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as TimeRangePreset)}
      className="h-8 rounded-md border border-border-subtle bg-panel px-3 text-xs text-text-primary"
    >
      {OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
