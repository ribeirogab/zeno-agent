import type { Stats } from '@/lib/use-stats';

export interface SubtitleInput {
  stats: Stats | undefined;
  lastTickAt: string | null | undefined;
  now: Date;
}

/**
 * Narrative subtitle shown under the Home greeting. Reads from the stats + health
 * heartbeat to produce one line summarising the state of Zeno.
 */
export function homeSubtitle(input: SubtitleInput): string {
  const { stats, lastTickAt, now } = input;
  if (!stats) return '';

  const hasAnyActivity = stats.activeCrons > 0 || stats.sessions24h > 0 || stats.runsToday > 0;
  if (!hasAnyActivity && !lastTickAt) {
    return 'All quiet. Nothing scheduled yet.';
  }

  const parts: string[] = [];

  if (stats.activeCrons === 0) parts.push('No active crons');
  else if (stats.activeCrons === 1) parts.push('1 scheduled cron');
  else parts.push(`${stats.activeCrons} scheduled crons`);

  if (stats.sessions24h === 1) parts.push('1 session in the last 24h');
  else if (stats.sessions24h > 1) parts.push(`${stats.sessions24h} sessions in the last 24h`);

  if (lastTickAt) {
    parts.push(`last tick ${relativeTime(new Date(`${lastTickAt}Z`), now)}`);
  }

  if (stats.failures24h > 0) {
    parts.push(
      stats.failures24h === 1
        ? '1 failure in the last 24h'
        : `${stats.failures24h} failures in the last 24h`,
    );
  }

  return `${parts.join(' · ')}.`;
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
