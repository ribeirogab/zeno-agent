import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export interface SessionApi {
  threadId: string;
  sessionId: string;
  createdAt: string;
  lastUsedAt: string;
}

export function useSessions() {
  return useQuery({
    queryKey: ['sessions'],
    queryFn: () => apiFetch<SessionApi[]>('/api/sessions'),
  });
}
