/**
 * TanStack Query hook for the M7 auto-discover installations flow.
 * Spec 0046.
 *
 * Backend endpoint: POST /api/connectors/catalog/github-app/installations/discover
 * which fetches /app/installations from GitHub via the stored PEM and returns
 * the list with `alreadyWired` flags.
 *
 * Cache: 5min staleTime; refetch on window focus catches the case of the
 * operator installing the App in another GitHub org while the modal is open.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export interface DiscoveredInstallation {
  id: string;
  name: string;
  accountType: string;
  repoCount: number | null;
  permissions: Record<string, string>;
  alreadyWired: boolean;
}

export interface DiscoverResponse {
  installations: DiscoveredInstallation[];
}

const QUERY_KEY = ['github-app', 'installations', 'discover'] as const;

export function useDiscoverInstallations(enabled: boolean = true) {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () =>
      apiFetch<DiscoverResponse>('/api/connectors/catalog/github-app/installations/discover', {
        method: 'POST',
        body: '{}',
      }),
    staleTime: 5 * 60 * 1000, // 5min — covers re-opening modal during config
    refetchOnWindowFocus: true,
    enabled,
  });
}

/** Manual refetch trigger (the "↻" button inside M7). */
export function useRefetchDiscovery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
