/**
 * Rotate-PEM mutation hook. Spec 0046.
 *
 * Backend endpoint: POST /api/connectors/catalog/github-app/rotate-pem
 *   body: {newPem, confirmAppId}
 *
 * The backend validates the new PEM (sign JWT, GET /app, mint a test token
 * for every installation) before atomically updating connector_apps. On
 * validation failure the backend returns 200 with `{ok: false, ...}` (NOT
 * 4xx), so success/failure must be checked at the modal layer — the factory
 * onError fires for thrown errors only.
 */

import { apiFetch } from '@/lib/api-client';
import type { AppDetail } from '@/lib/use-app-detail';
import { cacheChange, useOptimisticMutation } from '@/lib/use-optimistic-mutation';

export interface RotatePemInput {
  newPem: string;
  confirmAppId: string;
}

export interface RotatePemResponse {
  ok: boolean;
  errorKind?: string;
  error?: string;
}

export function useRotatePem(appUuid: string | undefined) {
  return useOptimisticMutation<RotatePemInput, RotatePemResponse>({
    mutationFn: (input) =>
      apiFetch<RotatePemResponse>('/api/connectors/catalog/github-app/rotate-pem', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    optimisticUpdate: () => {
      if (!appUuid) return [];
      return [
        cacheChange<AppDetail>(['app', appUuid], (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            app: {
              ...prev.app,
              pemRotatedAt: new Date().toISOString(),
              // pemSha256 stays stale until backend confirms; the
              // invalidateSoon below will reconcile within ~1.5s.
            },
          };
        }),
      ];
    },
    invalidateKeys: () => (appUuid ? [['app', appUuid]] : []),
    // No successToast — modal stays open if backend returns ok: false to
    // surface the validation error inline; toast would be misleading.
  });
}
