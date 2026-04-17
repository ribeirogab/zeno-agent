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
    return 'Silêncio por aqui. Nada agendado ainda.';
  }

  const parts: string[] = [];

  if (stats.activeCrons === 0) parts.push('Nenhum cron ativo');
  else if (stats.activeCrons === 1) parts.push('1 cron agendado');
  else parts.push(`${stats.activeCrons} crons agendados`);

  if (stats.sessions24h === 1) parts.push('1 sessão nas últimas 24h');
  else if (stats.sessions24h > 1) parts.push(`${stats.sessions24h} sessões nas últimas 24h`);

  if (lastTickAt) {
    parts.push(`último tick ${relativeTime(new Date(`${lastTickAt}Z`), now)}`);
  }

  if (stats.failures24h > 0) {
    parts.push(
      stats.failures24h === 1
        ? '1 falha nas últimas 24h'
        : `${stats.failures24h} falhas nas últimas 24h`,
    );
  }

  return `${parts.join(' · ')}.`;
}

/**
 * Relative time string in PT-BR: "há 2min", "há 3h", "há 5d".
 * Negative deltas (future timestamps, clock skew) clamp to "agora mesmo".
 */
export function relativeTime(then: Date, now: Date): string {
  const diffMs = now.getTime() - then.getTime();
  if (diffMs < 0 || diffMs < 45_000) return 'agora mesmo';
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 3600) return `há ${Math.floor(diffSec / 60)}min`;
  if (diffSec < 86_400) return `há ${Math.floor(diffSec / 3600)}h`;
  return `há ${Math.floor(diffSec / 86_400)}d`;
}
