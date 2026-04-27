import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export interface SettingsSnapshot {
  backend: { name: string; selectedVia: string };
  profileFiles: Array<{ path: string; bytes: number; mtime: string }>;
}

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => apiFetch<SettingsSnapshot>('/api/settings'),
  });
}
