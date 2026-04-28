import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { useOptimisticMutation } from '@/lib/use-optimistic-mutation';

export interface LinkedSkill {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
}

export function useConnectorSkills(connectorId: string | undefined) {
  return useQuery({
    queryKey: ['connector-skills', connectorId],
    queryFn: () => apiFetch<LinkedSkill[]>(`/api/connectors/${connectorId}/skills`),
    enabled: Boolean(connectorId),
  });
}

export function useReplaceConnectorSkills() {
  return useOptimisticMutation<{ connectorId: string; skillIds: string[] }, void>({
    mutationFn: ({ connectorId, skillIds }) =>
      apiFetch<void>(`/api/connectors/${connectorId}/skills`, {
        method: 'PATCH',
        body: JSON.stringify({ skillIds }),
      }),
    invalidateKeys: ({ connectorId }) => [['connector-skills', connectorId], ['skills']],
    successToast: 'linked skills updated',
  });
}
