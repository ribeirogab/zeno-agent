import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

interface NextCron {
  id: string;
  name: string;
  schedule: string;
  nextRunAt: string;
}

export function useNextCrons(limit = 3) {
  return useQuery({
    queryKey: ['next-crons', limit],
    queryFn: () => apiFetch<NextCron[]>(`/api/crons/next?limit=${limit}`),
    refetchInterval: 30_000,
  });
}
