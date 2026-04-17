/**
 * Cron schedule picker — pure model.
 *
 * Translates between a friendly `PickerState` (preset + a few fields) and the
 * 5-field cron expression accepted by the API. The React component in
 * `components/crons/schedule-picker.tsx` wires this into a UI.
 */

export type PresetKind =
  | 'everyMinutes'
  | 'hourly'
  | 'daily'
  | 'weekdays'
  | 'weekly'
  | 'monthly'
  | 'custom';

export interface PickerState {
  preset: PresetKind;
  everyNMinutes: 5 | 10 | 15 | 30;
  hourlyAtMinute: number;
  hour: number;
  minute: number;
  dow: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  dayOfMonth: number;
  raw: string;
}

export const DEFAULT_STATE: PickerState = {
  preset: 'daily',
  everyNMinutes: 15,
  hourlyAtMinute: 0,
  hour: 9,
  minute: 0,
  dow: 1,
  dayOfMonth: 1,
  raw: '0 9 * * *',
};

export const EVERY_N_MINUTES: ReadonlyArray<5 | 10 | 15 | 30> = [5, 10, 15, 30];

export const MINUTE_STEPS: ReadonlyArray<number> = [0, 15, 30, 45];

export const HOURLY_MINUTE_STEPS: ReadonlyArray<number> = [
  0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55,
];

export const DOW_LABELS: ReadonlyArray<{ value: 0 | 1 | 2 | 3 | 4 | 5 | 6; label: string }> = [
  { value: 0, label: 'sun' },
  { value: 1, label: 'mon' },
  { value: 2, label: 'tue' },
  { value: 3, label: 'wed' },
  { value: 4, label: 'thu' },
  { value: 5, label: 'fri' },
  { value: 6, label: 'sat' },
];

export const PRESET_LABELS: ReadonlyArray<{ value: PresetKind; label: string }> = [
  { value: 'everyMinutes', label: 'every N min' },
  { value: 'hourly', label: 'hourly' },
  { value: 'daily', label: 'daily' },
  { value: 'weekdays', label: 'weekdays' },
  { value: 'weekly', label: 'weekly' },
  { value: 'monthly', label: 'monthly' },
  { value: 'custom', label: 'custom' },
];

function pad2(n: number): string {
  return n.toString();
}

export function toCron(state: PickerState): string {
  switch (state.preset) {
    case 'everyMinutes':
      return `*/${state.everyNMinutes} * * * *`;
    case 'hourly':
      return `${pad2(state.hourlyAtMinute)} * * * *`;
    case 'daily':
      return `${pad2(state.minute)} ${pad2(state.hour)} * * *`;
    case 'weekdays':
      return `${pad2(state.minute)} ${pad2(state.hour)} * * 1-5`;
    case 'weekly':
      return `${pad2(state.minute)} ${pad2(state.hour)} * * ${state.dow}`;
    case 'monthly':
      return `${pad2(state.minute)} ${pad2(state.hour)} ${state.dayOfMonth} * *`;
    case 'custom':
      return state.raw.trim();
  }
}

function isEveryN(value: number): value is 5 | 10 | 15 | 30 {
  return value === 5 || value === 10 || value === 15 || value === 30;
}

function isDow(value: number): value is 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  return Number.isInteger(value) && value >= 0 && value <= 6;
}

export function fromCron(expr: string): PickerState {
  const trimmed = expr.trim();
  const base: PickerState = { ...DEFAULT_STATE, preset: 'custom', raw: trimmed };

  const everyN = trimmed.match(/^\*\/(\d+) \* \* \* \*$/);
  if (everyN) {
    const n = Number(everyN[1]);
    if (isEveryN(n)) {
      return { ...base, preset: 'everyMinutes', everyNMinutes: n };
    }
    return base;
  }

  const hourly = trimmed.match(/^(\d+) \* \* \* \*$/);
  if (hourly) {
    return { ...base, preset: 'hourly', hourlyAtMinute: Number(hourly[1]) };
  }

  const weekdays = trimmed.match(/^(\d+) (\d+) \* \* 1-5$/);
  if (weekdays) {
    return {
      ...base,
      preset: 'weekdays',
      minute: Number(weekdays[1]),
      hour: Number(weekdays[2]),
    };
  }

  const weekly = trimmed.match(/^(\d+) (\d+) \* \* (\d)$/);
  if (weekly) {
    const dowNum = Number(weekly[3]);
    if (isDow(dowNum)) {
      return {
        ...base,
        preset: 'weekly',
        minute: Number(weekly[1]),
        hour: Number(weekly[2]),
        dow: dowNum,
      };
    }
  }

  const monthly = trimmed.match(/^(\d+) (\d+) (\d+) \* \*$/);
  if (monthly) {
    return {
      ...base,
      preset: 'monthly',
      minute: Number(monthly[1]),
      hour: Number(monthly[2]),
      dayOfMonth: Number(monthly[3]),
    };
  }

  const daily = trimmed.match(/^(\d+) (\d+) \* \* \*$/);
  if (daily) {
    return {
      ...base,
      preset: 'daily',
      minute: Number(daily[1]),
      hour: Number(daily[2]),
    };
  }

  return base;
}
