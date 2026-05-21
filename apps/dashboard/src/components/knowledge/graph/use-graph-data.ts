import { useQuery } from '@tanstack/react-query';
import type { GraphResponse } from './types';

export function useGraphData() {
  return useQuery<GraphResponse>({
    queryKey: ['knowledge', 'graph'],
    queryFn: async () => {
      const res = await fetch('/api/knowledge/graph');
      if (!res.ok) {
        throw new Error(`graph fetch failed: ${res.status}`);
      }
      return (await res.json()) as GraphResponse;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}
