import { Chip } from '@zeno/ui';
import type { JSX } from 'react';
import type { TimeRangePreset } from '@/lib/log-filters';

const OPTIONS: Array<{ value: TimeRangePreset; label: string }> = [
  { value: '1h', label: 'LAST 1H' },
  { value: '24h', label: 'LAST 24H' },
  { value: '7d', label: 'LAST 7D' },
];

export function TimeRangeSelect({
  value,
  onChange,
}: {
  value: TimeRangePreset;
  onChange: (v: TimeRangePreset) => void;
}): JSX.Element {
  return (
    <div className="flex items-center gap-1">
      {OPTIONS.map((o) => (
        <Chip key={o.value} active={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </Chip>
      ))}
    </div>
  );
}
