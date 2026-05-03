import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

// Spec 0067 B: USER.md editor data source. Separate query from
// `useSettings` because the editor needs full content (`useSettings`
// only returns size/mtime). On save the mutation in `mutations.ts`
// invalidates this key alongside `['settings']`.

export interface UserMdSnapshot {
  path: string;
  bytes: number;
  mtime: string;
  content: string;
}

const QUERY_KEY = ['settings', 'user-md'] as const;

export const userMdQueryKey = QUERY_KEY;

export function useUserMd() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => apiFetch<UserMdSnapshot>('/api/settings/profile-files/USER.md'),
  });
}
