import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export interface Stats {
  activeCrons: number;
  sessions24h: number;
  runsToday: number;
  failures24h: number;
}

export function useStats() {
  return useQuery({
    queryKey: ['stats'],
    queryFn: () => apiFetch<Stats>('/api/stats'),
  });
}
