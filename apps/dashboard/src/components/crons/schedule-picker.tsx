import { Input } from '@zeno/ui';
import cronstrue from 'cronstrue/i18n';
import { type JSX, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_STATE,
  DOW_LABELS,
  EVERY_N_MINUTES,
  fromCron,
  HOURLY_MINUTE_STEPS,
  MINUTE_STEPS,
  type PickerState,
  PRESET_LABELS,
  type PresetKind,
  toCron,
} from '@/lib/cron-schedule';

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

function describe(cron: string): { text: string; valid: boolean } {
  try {
    const text = cronstrue.toString(cron, { locale: 'en', use24HourTimeFormat: true });
    return { text: text.toLowerCase(), valid: true };
  } catch {
    return { text: 'invalid expression', valid: false };
  }
}

const selectClass =
  'h-9 rounded-md border border-border-subtle bg-canvas px-2.5 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-secondary';

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

export interface SchedulePickerProps {
  value: string;
  onChange: (cron: string) => void;
}

export function SchedulePicker({ value, onChange }: SchedulePickerProps): JSX.Element {
  const [state, setState] = useState<PickerState>(() =>
    value && value.trim() ? fromCron(value) : { ...DEFAULT_STATE },
  );

  // Emit once on mount so the parent form starts with a valid cron even if the
  // user submits without touching any picker field.
  const didMount = useRef(false);
  useEffect(() => {
    if (didMount.current) return;
    didMount.current = true;
    onChange(toCron(state));
  }, [state, onChange]);

  const preview = describe(toCron(state));

  function patch(next: Partial<PickerState>): void {
    setState((prev) => {
      const merged = { ...prev, ...next };
      onChange(toCron(merged));
      return merged;
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="preset"
          className={selectClass}
          value={state.preset}
          onChange={(e) => patch({ preset: e.target.value as PresetKind })}
        >
          {PRESET_LABELS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>

        {state.preset === 'everyMinutes' && (
          <select
            aria-label="every-n-minutes"
            className={selectClass}
            value={state.everyNMinutes}
            onChange={(e) => patch({ everyNMinutes: Number(e.target.value) as 5 | 10 | 15 | 30 })}
          >
            {EVERY_N_MINUTES.map((n) => (
              <option key={n} value={n}>
                {n} min
              </option>
            ))}
          </select>
        )}

        {state.preset === 'hourly' && (
          <select
            aria-label="hourly-at-minute"
            className={selectClass}
            value={state.hourlyAtMinute}
            onChange={(e) => patch({ hourlyAtMinute: Number(e.target.value) })}
          >
            {HOURLY_MINUTE_STEPS.map((m) => (
              <option key={m} value={m}>
                at minute {pad(m)}
              </option>
            ))}
          </select>
        )}

        {(state.preset === 'daily' ||
          state.preset === 'weekdays' ||
          state.preset === 'weekly' ||
          state.preset === 'monthly') && (
          <>
            <span className="text-sm text-text-tertiary">at</span>
            <select
              aria-label="hour"
              className={selectClass}
              value={state.hour}
              onChange={(e) => patch({ hour: Number(e.target.value) })}
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {pad(h)}
                </option>
              ))}
            </select>
            <span className="text-sm text-text-tertiary">:</span>
            <select
              aria-label="minute"
              className={selectClass}
              value={state.minute}
              onChange={(e) => patch({ minute: Number(e.target.value) })}
            >
              {MINUTE_STEPS.map((m) => (
                <option key={m} value={m}>
                  {pad(m)}
                </option>
              ))}
            </select>
          </>
        )}

        {state.preset === 'weekly' && (
          <select
            aria-label="day-of-week"
            className={selectClass}
            value={state.dow}
            onChange={(e) => patch({ dow: Number(e.target.value) as 0 | 1 | 2 | 3 | 4 | 5 | 6 })}
          >
            {DOW_LABELS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        )}

        {state.preset === 'monthly' && (
          <select
            aria-label="day-of-month"
            className={selectClass}
            value={state.dayOfMonth}
            onChange={(e) => patch({ dayOfMonth: Number(e.target.value) })}
          >
            {DAYS.map((d) => (
              <option key={d} value={d}>
                day {d}
              </option>
            ))}
          </select>
        )}

        {state.preset === 'custom' && (
          <Input
            aria-label="raw-cron"
            className="flex-1 font-mono"
            value={state.raw}
            onChange={(e) => patch({ raw: e.target.value })}
            placeholder="0 9 * * 1-5"
          />
        )}
      </div>

      <span
        className={`font-mono text-xs ${preview.valid ? 'text-text-tertiary' : 'text-status-failed'}`}
      >
        {preview.text}
      </span>
    </div>
  );
}
