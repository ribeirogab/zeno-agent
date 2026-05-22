import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

/** Spec 2026-05-22 (crons CLI-first): slim shape — DB is a derived cache,
 *  prompt + notify config live in the filesystem (CRON.md). */
export interface CronApi {
  id: string;
  name: string;
  description: string | null;
  schedule: string;
  enabled: boolean;
  contentHash: string;
  mtimeMs: number;
  updatedAt: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
}

export function useCrons() {
  return useQuery({
    queryKey: ['crons'],
    queryFn: () => apiFetch<CronApi[]>('/api/crons'),
  });
}
