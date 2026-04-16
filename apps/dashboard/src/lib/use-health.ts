import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export type ServiceStatus = 'ticking' | 'idle' | 'stale' | 'unknown';

export interface Health {
  status: 'ok';
  uptime: number;
  services: { backend: ServiceStatus; slack: ServiceStatus; runner: ServiceStatus };
  lastTickAt: string | null;
}

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => apiFetch<Health>('/api/health'),
    refetchInterval: 30_000,
    staleTime: 0,
  });
}
