import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { CronApi } from '@/lib/use-crons';

export interface CronRunApi {
  id: string;
  cronId: string;
  startedAt: string;
  finishedAt: string | null;
  status: 'running' | 'success' | 'failed' | 'skipped';
  output: string | null;
  error: string | null;
}

export function useCron(id: string) {
  return useQuery({
    queryKey: ['crons', id],
    queryFn: () => apiFetch<{ cron: CronApi; recentRuns: CronRunApi[] }>(`/api/crons/${id}`),
  });
}
