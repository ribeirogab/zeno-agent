export type LogLevel = 30 | 40 | 50;
export type LogLevelName = 'info' | 'warn' | 'error';
export type TimeRangePreset = '1h' | '24h' | '7d';

export interface LogApi {
  id: number;
  ts: string;
  level: number;
  service: string;
  event: string | null;
  correlationId: string | null;
  message: string | null;
  payload: string;
}

export interface LogFilters {
  level: LogLevelName | 'all';
  q: string;
  timeRange: TimeRangePreset;
}

export const DEFAULT_FILTERS: LogFilters = {
  level: 'all',
  q: '',
  timeRange: '1h',
};

export function presetToSinceIso(preset: TimeRangePreset, now: Date = new Date()): string {
  const hours = preset === '1h' ? 1 : preset === '24h' ? 24 : 24 * 7;
  return new Date(now.getTime() - hours * 3600_000).toISOString();
}

export function filtersToQueryString(filters: LogFilters): string {
  const params = new URLSearchParams();
  if (filters.level !== 'all') params.set('level', filters.level);
  if (filters.q.trim().length > 0) params.set('q', filters.q.trim());
  params.set('since', presetToSinceIso(filters.timeRange));
  return params.toString();
}
