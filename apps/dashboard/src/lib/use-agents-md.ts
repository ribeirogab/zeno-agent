import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

// Spec 2026-05-20 (agents-md-per-instance): AGENTS.md editor data
// source. Separate query from `useSettings` because the editor needs
// full content (`useSettings` only returns size/mtime). On save the
// mutation in `mutations.ts` invalidates this key alongside
// `['settings']`.

export interface AgentsMdSnapshot {
  path: string;
  bytes: number;
  mtime: string;
  content: string;
}

const QUERY_KEY = ['settings', 'agents-md'] as const;

export const agentsMdQueryKey = QUERY_KEY;

export function useAgentsMd() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => apiFetch<AgentsMdSnapshot>('/api/settings/profile-files/AGENTS.md'),
  });
}
