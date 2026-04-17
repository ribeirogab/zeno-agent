import { describe, expect, it } from 'vitest';
import { DEFAULT_STATE, fromCron, type PickerState, toCron } from '@/lib/cron-schedule';

function state(overrides: Partial<PickerState>): PickerState {
  return { ...DEFAULT_STATE, ...overrides };
}

describe('toCron', () => {
  it('everyMinutes', () => {
    expect(toCron(state({ preset: 'everyMinutes', everyNMinutes: 15 }))).toBe('*/15 * * * *');
    expect(toCron(state({ preset: 'everyMinutes', everyNMinutes: 5 }))).toBe('*/5 * * * *');
  });
  it('hourly', () => {
    expect(toCron(state({ preset: 'hourly', hourlyAtMinute: 0 }))).toBe('0 * * * *');
    expect(toCron(state({ preset: 'hourly', hourlyAtMinute: 30 }))).toBe('30 * * * *');
  });
  it('daily', () => {
    expect(toCron(state({ preset: 'daily', hour: 9, minute: 0 }))).toBe('0 9 * * *');
    expect(toCron(state({ preset: 'daily', hour: 18, minute: 30 }))).toBe('30 18 * * *');
  });
  it('weekdays', () => {
    expect(toCron(state({ preset: 'weekdays', hour: 9, minute: 0 }))).toBe('0 9 * * 1-5');
  });
  it('weekly', () => {
    expect(toCron(state({ preset: 'weekly', hour: 20, minute: 0, dow: 0 }))).toBe('0 20 * * 0');
    expect(toCron(state({ preset: 'weekly', hour: 8, minute: 45, dow: 3 }))).toBe('45 8 * * 3');
  });
  it('monthly', () => {
    expect(toCron(state({ preset: 'monthly', hour: 12, minute: 0, dayOfMonth: 1 }))).toBe(
      '0 12 1 * *',
    );
    expect(toCron(state({ preset: 'monthly', hour: 22, minute: 15, dayOfMonth: 28 }))).toBe(
      '15 22 28 * *',
    );
  });
  it('custom passes through trimmed raw', () => {
    expect(toCron(state({ preset: 'custom', raw: '  */15 9-18 * * 1-5  ' }))).toBe(
      '*/15 9-18 * * 1-5',
    );
  });
});

describe('fromCron', () => {
  it('detects everyMinutes when N is 5/10/15/30', () => {
    expect(fromCron('*/15 * * * *')).toMatchObject({ preset: 'everyMinutes', everyNMinutes: 15 });
    expect(fromCron('*/5 * * * *')).toMatchObject({ preset: 'everyMinutes', everyNMinutes: 5 });
  });
  it('falls back to custom for */N outside the preset set', () => {
    expect(fromCron('*/7 * * * *')).toMatchObject({ preset: 'custom', raw: '*/7 * * * *' });
  });
  it('detects hourly', () => {
    expect(fromCron('0 * * * *')).toMatchObject({ preset: 'hourly', hourlyAtMinute: 0 });
    expect(fromCron('30 * * * *')).toMatchObject({ preset: 'hourly', hourlyAtMinute: 30 });
  });
  it('detects weekdays', () => {
    expect(fromCron('0 9 * * 1-5')).toMatchObject({
      preset: 'weekdays',
      hour: 9,
      minute: 0,
    });
  });
  it('detects weekly', () => {
    expect(fromCron('0 20 * * 0')).toMatchObject({
      preset: 'weekly',
      hour: 20,
      minute: 0,
      dow: 0,
    });
  });
  it('detects monthly', () => {
    expect(fromCron('15 22 28 * *')).toMatchObject({
      preset: 'monthly',
      hour: 22,
      minute: 15,
      dayOfMonth: 28,
    });
  });
  it('detects daily (last to avoid shadowing weekdays/weekly/monthly)', () => {
    expect(fromCron('30 18 * * *')).toMatchObject({
      preset: 'daily',
      hour: 18,
      minute: 30,
    });
  });
  it('returns custom for unparseable', () => {
    expect(fromCron('nonsense')).toMatchObject({ preset: 'custom', raw: 'nonsense' });
    expect(fromCron('*/15 9-18 * * 1-5')).toMatchObject({
      preset: 'custom',
      raw: '*/15 9-18 * * 1-5',
    });
  });
});

describe('toCron ∘ fromCron round-trip', () => {
  const cases: string[] = [
    '*/15 * * * *',
    '0 * * * *',
    '30 18 * * *',
    '0 9 * * 1-5',
    '0 20 * * 0',
    '15 22 28 * *',
  ];
  for (const expr of cases) {
    it(`round-trips ${expr}`, () => {
      expect(toCron(fromCron(expr))).toBe(expr);
    });
  }
});
