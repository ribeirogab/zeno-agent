import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

interface SparklineResponse {
  buckets: Array<{ hour: string; count: number }>;
}

export function useSparkline(metric: 'runs' | 'sessions' | 'failures') {
  return useQuery({
    queryKey: ['sparkline', metric],
    queryFn: () => apiFetch<SparklineResponse>(`/api/stats/sparkline?metric=${metric}`),
    refetchInterval: 60_000,
    select: (data) => data.buckets.map((b) => b.count),
  });
}
