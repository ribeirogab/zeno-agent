import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { useOptimisticMutation } from '@/lib/use-optimistic-mutation';

export interface LinkedCronConnector {
  id: string;
  slug: string;
  displayName: string;
  status: 'enabled' | 'disabled' | 'pending';
}

export function useCronConnectors(cronId: string | undefined) {
  return useQuery({
    queryKey: ['cron-connectors', cronId],
    queryFn: () => apiFetch<LinkedCronConnector[]>(`/api/crons/${cronId}/connectors`),
    enabled: Boolean(cronId),
  });
}

export function useReplaceCronConnectors() {
  return useOptimisticMutation<{ cronId: string; connectorIds: string[] }, void>({
    mutationFn: ({ cronId, connectorIds }) =>
      apiFetch<void>(`/api/crons/${cronId}/connectors`, {
        method: 'PATCH',
        body: JSON.stringify({ connectorIds }),
      }),
    invalidateKeys: ({ cronId }) => [['cron-connectors', cronId], ['connectors']],
    successToast: 'linked connectors updated',
  });
}
