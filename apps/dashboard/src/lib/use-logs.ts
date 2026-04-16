import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { filtersToQueryString, type LogApi, type LogFilters } from '@/lib/log-filters';

export interface LogsResponse {
  logs: LogApi[];
  nextCursorId: number | null;
}

export function useLogs(filters: LogFilters, enabled: boolean) {
  const qs = filtersToQueryString(filters);
  return useQuery({
    queryKey: ['logs', filters],
    queryFn: () => apiFetch<LogsResponse>(`/api/logs?${qs}&limit=100`),
    enabled,
  });
}
