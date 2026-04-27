/**
 * Rename env-var mutation hook. Spec 0046 M11.
 *
 * Backend endpoint: PATCH /api/connectors/:id with body {envVar: 'NEW_NAME'}
 * (server translates to a secrets-only patch + enqueues `connector_update`
 * which routes to `githubApp.renameInstallation()`).
 *
 * Uses `useOptimisticMutation` factory. Optimistic update flips the
 * installation row's envVar field.
 */

import { apiFetch } from '@/lib/api-client';
import type { AppDetail } from '@/lib/use-app-detail';
import { cacheChange, useOptimisticMutation } from '@/lib/use-optimistic-mutation';

export interface RenameEnvVarInput {
  connectorId: string;
  newEnvVar: string;
}

export function useRenameEnvVar(appUuid: string | undefined) {
  return useOptimisticMutation<RenameEnvVarInput, void>({
    mutationFn: (input) =>
      apiFetch<void>(`/api/connectors/${input.connectorId}`, {
        method: 'PATCH',
        body: JSON.stringify({ envVar: input.newEnvVar }),
      }),
    optimisticUpdate: (input) => {
      if (!appUuid) return [];
      return [
        cacheChange<AppDetail>(['app', appUuid], (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            installations: prev.installations.map((i) =>
              i.connectorId === input.connectorId ? { ...i, envVar: input.newEnvVar } : i,
            ),
          };
        }),
      ];
    },
    invalidateKeys: () => (appUuid ? [['app', appUuid], ['connectors']] : [['connectors']]),
    successToast: (_, vars) => `env var renamed to ${vars.newEnvVar}`,
  });
}
