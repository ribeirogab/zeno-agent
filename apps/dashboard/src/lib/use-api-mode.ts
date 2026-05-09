import { useQuery } from '@tanstack/react-query';

export type ApiWriteMode = 'cli' | 'dashboard';

export interface ApiMode {
  writes: ApiWriteMode;
}

export function useApiMode() {
  return useQuery({
    queryKey: ['api-mode'],
    queryFn: async (): Promise<ApiMode> => {
      const res = await fetch('/api/mode');
      if (!res.ok) throw new Error('mode endpoint failed');
      return res.json() as Promise<ApiMode>;
    },
    staleTime: Infinity,
  });
}
