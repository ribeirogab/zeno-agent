import type { Stats } from '@/lib/use-stats';

export interface SubtitleInput {
  stats: Stats | undefined;
  lastTickAt: string | null | undefined;
  now: Date;
}

/**
 * Brief subtitle shown under the Home greeting. Reads from stats + the runtime
 * heartbeat to produce a short, dot-separated summary line. Empty string when
 * stats are still loading (caller should show a skeleton).
 */
export function homeSubtitle(input: SubtitleInput): string {
  const { stats, lastTickAt, now } = input;
  if (!stats) return '';

  const hasAnyActivity =
    stats.activeCrons > 0 || stats.sessions24h > 0 || stats.runsToday > 0 || stats.failures24h > 0;
  if (!hasAnyActivity && !lastTickAt) {
    return 'All quiet. Nothing scheduled yet.';
  }

  const fragments: string[] = [];

  if (stats.activeCrons > 0) {
    fragments.push(`${stats.activeCrons} scheduled ${stats.activeCrons === 1 ? 'cron' : 'crons'}`);
  }

  if (stats.sessions24h > 0) {
    fragments.push(
      `${stats.sessions24h} ${stats.sessions24h === 1 ? 'session' : 'sessions'} in the last 24h`,
    );
  }

  if (stats.failures24h > 0) {
    fragments.push(
      `${stats.failures24h} ${stats.failures24h === 1 ? 'failure' : 'failures'} in the last 24h`,
    );
  }

  if (lastTickAt) {
    const elapsed = relativeTime(new Date(`${lastTickAt}Z`), now);
    fragments.push(`last tick ${elapsed}`);
  }

  return `${fragments.join(' · ')}.`;
}

/**
 * Relative time string in English: "2m ago", "3h ago", "5d ago".
 * Negative deltas (future timestamps, clock skew) clamp to "just now".
 */
export function relativeTime(then: Date, now: Date): string {
  const diffMs = now.getTime() - then.getTime();
  if (diffMs < 0 || diffMs < 45_000) return 'just now';
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86_400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86_400)}d ago`;
}
