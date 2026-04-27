/**
 * Remove-installation mutation hook. Spec 0046.
 *
 * Backend endpoint: DELETE /api/connectors/:id (existing; the worker handler
 * routes github-app-* through `connector_uninstall` →
 * `githubApp.removeInstallation()`).
 *
 * Uses `useOptimisticMutation` factory. Optimistic update drops the
 * installation row from the App detail cache.
 */

import { apiFetch } from '@/lib/api-client';
import type { AppDetail } from '@/lib/use-app-detail';
import { cacheChange, useOptimisticMutation } from '@/lib/use-optimistic-mutation';

export function useRemoveInstallation(appUuid: string | undefined) {
  return useOptimisticMutation<string, void>({
    mutationFn: (connectorId) =>
      apiFetch<void>(`/api/connectors/${connectorId}`, { method: 'DELETE' }),
    optimisticUpdate: (connectorId) => {
      if (!appUuid) return [];
      return [
        cacheChange<AppDetail>(['app', appUuid], (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            installations: prev.installations.filter((i) => i.connectorId !== connectorId),
          };
        }),
      ];
    },
    invalidateKeys: () => (appUuid ? [['app', appUuid], ['connectors']] : [['connectors']]),
    successToast: 'installation removed',
  });
}
