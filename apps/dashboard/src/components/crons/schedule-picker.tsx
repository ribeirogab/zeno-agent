import { Chip, Input } from '@zeno/ui';
import type { JSX } from 'react';

const PRESETS: ReadonlyArray<readonly [string, string]> = [
  ['every day · 09:00', '0 9 * * *'],
  ['every day · 21:00', '0 21 * * *'],
  ['weekdays · 09:00', '0 9 * * 1-5'],
  ['every 30 minutes', '*/30 * * * *'],
  ['every 2 hours', '0 */2 * * *'],
  ['friday · 18:00', '0 18 * * 5'],
] as const;

export interface SchedulePickerProps {
  value: string;
  onChange: (cron: string) => void;
}

export function SchedulePicker({ value, onChange }: SchedulePickerProps): JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <Input
        aria-label="cron expression"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="0 9 * * 1-5"
        className="text-gold"
      />
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map(([label, preset]) => (
          <Chip key={preset} active={value === preset} onClick={() => onChange(preset)}>
            {label}
          </Chip>
        ))}
      </div>
    </div>
  );
}
