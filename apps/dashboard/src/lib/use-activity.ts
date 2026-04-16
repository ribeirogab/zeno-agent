import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export interface Activity {
  id: string;
  kind: 'cron_run';
  timestamp: string;
  summary: string;
  status: 'running' | 'success' | 'failed' | 'skipped';
}

export function useActivity(limit = 10) {
  return useQuery({
    queryKey: ['activity', limit],
    queryFn: () => apiFetch<Activity[]>(`/api/activity?limit=${limit}`),
  });
}
