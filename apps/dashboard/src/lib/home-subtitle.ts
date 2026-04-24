import type { Stats } from '@/lib/use-stats';

export interface SubtitleInput {
  stats: Stats | undefined;
  lastTickAt: string | null | undefined;
  now: Date;
}

const WORD_NUMBERS: ReadonlyArray<string> = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
];

function toWord(n: number): string {
  if (n >= 0 && n < WORD_NUMBERS.length) return WORD_NUMBERS[n] as string;
  return String(n);
}

function plural(n: number, singular: string, pluralForm: string): string {
  return n === 1 ? `${toWord(n)} ${singular}` : `${toWord(n)} ${pluralForm}`;
}

/**
 * Narrative subtitle shown under the Home greeting. Reads from the stats + health
 * heartbeat to produce literary English prose summarising the state of Zeno.
 */
export function homeSubtitle(input: SubtitleInput): string {
  const { stats, lastTickAt, now } = input;
  if (!stats) return '';

  const hasAnyActivity = stats.activeCrons > 0 || stats.sessions24h > 0 || stats.runsToday > 0;
  if (!hasAnyActivity && !lastTickAt) {
    return 'All quiet. Nothing scheduled yet.';
  }

  const sentences: string[] = [];

  // Opening tone
  if (stats.failures24h === 0 && stats.activeCrons > 0) {
    sentences.push('Quiet so far.');
  }

  // Main summary sentence
  const fragments: string[] = [];

  if (stats.activeCrons > 0) {
    fragments.push(
      `${toWord(stats.activeCrons).charAt(0).toUpperCase()}${toWord(stats.activeCrons).slice(1)} ${stats.activeCrons === 1 ? 'cron' : 'crons'} scheduled`,
    );
  } else {
    fragments.push('No crons scheduled');
  }

  if (stats.sessions24h > 0) {
    fragments.push(`${plural(stats.sessions24h, 'session', 'sessions')} today`);
  }

  if (lastTickAt) {
    const elapsed = relativeTime(new Date(`${lastTickAt}Z`), now);
    fragments.push(`last tick fired ${elapsed}`);
  }

  sentences.push(`${fragments.join(', ')}.`);

  // Closing reassurance
  if (stats.failures24h === 0) {
    sentences.push('Nothing demands your attention.');
  } else {
    sentences.push(
      `${toWord(stats.failures24h).charAt(0).toUpperCase()}${toWord(stats.failures24h).slice(1)} ${stats.failures24h === 1 ? 'failure' : 'failures'} logged — worth a look.`,
    );
  }

  return sentences.join(' ');
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
