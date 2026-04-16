import { describe, expect, it } from 'vitest';
import { nextRunAfter, validateSchedule } from '@/cron/parser';

describe('cron/parser', () => {
  describe('validateSchedule', () => {
    it('accepts a valid 5-field expression', () => {
      expect(() => validateSchedule('0 9 * * 1-5')).not.toThrow();
    });

    it('throws on garbage', () => {
      expect(() => validateSchedule('not a cron')).toThrow();
    });

    it('throws on out-of-range fields', () => {
      expect(() => validateSchedule('0 99 * * *')).toThrow();
    });
  });

  describe('nextRunAfter', () => {
    it('computes the next minute boundary for "* * * * *"', () => {
      const from = new Date('2026-04-16T10:00:30Z');
      const next = nextRunAfter('* * * * *', from);
      expect(next).toBeInstanceOf(Date);
      // The very next minute boundary is 10:01:00 UTC
      expect(next?.toISOString()).toBe('2026-04-16T10:01:00.000Z');
    });

    it('respects time zones when provided', () => {
      // 09:00 in Sao Paulo (UTC-3) on a Monday is 12:00 UTC
      const from = new Date('2026-04-13T05:00:00Z'); // Monday morning UTC
      const next = nextRunAfter('0 9 * * 1-5', from, 'America/Sao_Paulo');
      expect(next?.toISOString()).toBe('2026-04-13T12:00:00.000Z');
    });
  });
});
