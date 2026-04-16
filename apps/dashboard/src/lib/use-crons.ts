import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export interface CronApi {
  id: string;
  name: string;
  description: string | null;
  prompt: string;
  schedule: string;
  enabled: boolean;
  source: 'static' | 'chat';
  createdBy: string | null;
  notifyConversationId: string | null;
  notifyThreadId: string | null;
  createdAt: string;
  updatedAt: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

export function useCrons() {
  return useQuery({
    queryKey: ['crons'],
    queryFn: () => apiFetch<CronApi[]>('/api/crons'),
  });
}
