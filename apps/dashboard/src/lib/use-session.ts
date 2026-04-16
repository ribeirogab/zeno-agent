import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { SessionApi } from '@/lib/use-sessions';

export interface SessionMessageApi {
  id: string;
  role: 'user' | 'assistant' | 'system';
  author: string;
  timestamp: string;
  text: string;
  toolCalls: Array<{ tool: string; input: unknown }>;
}

export function useSession(threadId: string) {
  return useQuery({
    queryKey: ['sessions', threadId],
    queryFn: () =>
      apiFetch<{ session: SessionApi; messages: SessionMessageApi[] }>(
        `/api/sessions/${threadId}`,
      ),
  });
}
