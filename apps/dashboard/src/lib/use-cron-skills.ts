import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { useOptimisticMutation } from '@/lib/use-optimistic-mutation';

export interface LinkedCronSkill {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
}

export function useCronSkills(cronId: string | undefined) {
  return useQuery({
    queryKey: ['cron-skills', cronId],
    queryFn: () => apiFetch<LinkedCronSkill[]>(`/api/crons/${cronId}/skills`),
    enabled: Boolean(cronId),
  });
}

export function useReplaceCronSkills() {
  return useOptimisticMutation<{ cronId: string; skillIds: string[] }, void>({
    mutationFn: ({ cronId, skillIds }) =>
      apiFetch<void>(`/api/crons/${cronId}/skills`, {
        method: 'PATCH',
        body: JSON.stringify({ skillIds }),
      }),
    invalidateKeys: ({ cronId }) => [['cron-skills', cronId], ['skills']],
    successToast: 'linked skills updated',
  });
}
