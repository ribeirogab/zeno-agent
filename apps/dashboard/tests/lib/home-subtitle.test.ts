import { describe, expect, it } from 'vitest';
import { homeSubtitle, relativeTime } from '@/lib/home-subtitle';

const NOW = new Date('2026-04-16T12:00:00Z');

describe('homeSubtitle', () => {
  it('returns empty string when stats undefined (caller renders Skeleton)', () => {
    expect(homeSubtitle({ stats: undefined, lastTickAt: null, now: NOW })).toBe('');
  });

  it('shows silence copy when nothing is happening', () => {
    const stats = { activeCrons: 0, sessions24h: 0, runsToday: 0, failures24h: 0 };
    expect(homeSubtitle({ stats, lastTickAt: null, now: NOW })).toBe(
      'Silêncio por aqui. Nada agendado ainda.',
    );
  });

  it('singular forms', () => {
    const stats = { activeCrons: 1, sessions24h: 1, runsToday: 1, failures24h: 1 };
    expect(homeSubtitle({ stats, lastTickAt: null, now: NOW })).toBe(
      '1 cron agendado · 1 sessão nas últimas 24h · 1 falha nas últimas 24h.',
    );
  });

  it('plural forms', () => {
    const stats = { activeCrons: 3, sessions24h: 12, runsToday: 47, failures24h: 2 };
    expect(homeSubtitle({ stats, lastTickAt: null, now: NOW })).toBe(
      '3 crons agendados · 12 sessões nas últimas 24h · 2 falhas nas últimas 24h.',
    );
  });

  it('appends lastTick when available', () => {
    const stats = { activeCrons: 1, sessions24h: 0, runsToday: 0, failures24h: 0 };
    // lastTick 5 minutes before NOW
    const lastTickAt = '2026-04-16 11:55:00';
    expect(homeSubtitle({ stats, lastTickAt, now: NOW })).toBe(
      '1 cron agendado · último tick há 5min.',
    );
  });

  it('omits zero sessions/failures but keeps the cron count', () => {
    const stats = { activeCrons: 5, sessions24h: 0, runsToday: 0, failures24h: 0 };
    expect(homeSubtitle({ stats, lastTickAt: null, now: NOW })).toBe('5 crons agendados.');
  });
});

describe('relativeTime', () => {
  it('returns "agora mesmo" for <45s', () => {
    const then = new Date(NOW.getTime() - 10_000);
    expect(relativeTime(then, NOW)).toBe('agora mesmo');
  });

  it('returns minutes for <1h', () => {
    const then = new Date(NOW.getTime() - 5 * 60_000);
    expect(relativeTime(then, NOW)).toBe('há 5min');
  });

  it('returns hours for <1d', () => {
    const then = new Date(NOW.getTime() - 3 * 3600_000);
    expect(relativeTime(then, NOW)).toBe('há 3h');
  });

  it('returns days beyond 24h', () => {
    const then = new Date(NOW.getTime() - 2 * 86400_000);
    expect(relativeTime(then, NOW)).toBe('há 2d');
  });

  it('clamps future timestamps to "agora mesmo"', () => {
    const then = new Date(NOW.getTime() + 60_000);
    expect(relativeTime(then, NOW)).toBe('agora mesmo');
  });
});
