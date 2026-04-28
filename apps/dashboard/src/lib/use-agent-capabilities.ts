import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { useOptimisticMutation } from '@/lib/use-optimistic-mutation';

export interface AgentCapability {
  toolName: string;
  enabled: boolean;
  updatedAt: string;
}

export interface CapabilityUpdate {
  toolName: string;
  enabled: boolean;
}

export function useAgentCapabilities() {
  return useQuery({
    queryKey: ['agent-capabilities'],
    queryFn: () => apiFetch<AgentCapability[]>('/api/agent-capabilities'),
  });
}

export function useUpdateAgentCapabilities() {
  return useOptimisticMutation<{ updates: CapabilityUpdate[] }, AgentCapability[]>({
    mutationFn: ({ updates }) =>
      apiFetch<AgentCapability[]>('/api/agent-capabilities', {
        method: 'PATCH',
        body: JSON.stringify({ updates }),
      }),
    invalidateKeys: () => [['agent-capabilities']],
  });
}
