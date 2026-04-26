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
  /** Helper line shown below the input — usually a green ✓ confirming the parsed schedule. */
  helper?: string;
}

/**
 * Cron-expression input with quick-pick chips below. Visual reference:
 * the schedule field inside `apps/design/src/components/modals/new-cron-modal.tsx`.
 */
export function SchedulePicker({ value, onChange, helper }: SchedulePickerProps): JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <input
        aria-label="cron expression"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0 9 * * 1-5"
        className="w-full bg-panel-2 border border-gold px-3 py-2.5 font-mono text-[13px] leading-4 text-text-primary outline-0"
        style={{ boxShadow: '0 0 0 3px rgba(217, 179, 98, 0.28)' }}
      />
      {helper ? (
        <span className="font-mono text-[10px] tracking-[0.04em] leading-3 text-status-active">
          ✓ {helper}
        </span>
      ) : null}
      <div className="flex flex-wrap gap-1.5 pt-0.5">
        {PRESETS.map(([label, preset]) => (
          <button
            key={preset}
            type="button"
            onClick={() => onChange(preset)}
            className={`inline-flex items-center px-2.5 py-1 border font-mono text-[10px] tracking-[0.06em] uppercase whitespace-nowrap transition-colors duration-[120ms] ${
              value === preset
                ? 'border-gold bg-gold-soft text-gold'
                : 'border-border-subtle text-text-secondary hover:border-gold-line hover:text-gold'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
