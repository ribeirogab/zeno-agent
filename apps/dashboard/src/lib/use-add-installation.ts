/**
 * Add-installation mutation hook. Spec 0046; spec 0051 dropped the envVar
 * field (the worker authenticates the github-mcp-server subprocess via the
 * fixed GITHUB_PERSONAL_ACCESS_TOKEN env var).
 *
 * Backend endpoint: POST /api/connectors/catalog/github-app/installations
 *   body: {installationId, displayName}
 *
 * Uses the project-wide `useOptimisticMutation` factory (see
 * `context/learnings/optimistic-mutation-pattern.md`).
 */

import { apiFetch } from '@/lib/api-client';
import type { AppDetail } from '@/lib/use-app-detail';
import { cacheChange, useOptimisticMutation } from '@/lib/use-optimistic-mutation';

export interface AddInstallationInput {
  installationId: string;
  displayName: string;
}

export interface AddInstallationResponse {
  ok: boolean;
  slug: string;
}

export function useAddInstallation(appUuid: string | undefined) {
  return useOptimisticMutation<AddInstallationInput, AddInstallationResponse>({
    mutationFn: (input) =>
      apiFetch<AddInstallationResponse>('/api/connectors/catalog/github-app/installations', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    optimisticUpdate: (input) => {
      if (!appUuid) return [];
      return [
        cacheChange<AppDetail>(['app', appUuid], (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            installations: [
              ...prev.installations,
              {
                connectorId: `pending-${input.installationId}`,
                slug: `github-app-${input.displayName.toLowerCase().replace(/[^a-z0-9-]+/g, '-')}`,
                displayName: `GitHub App — ${input.displayName}`,
                installationId: input.installationId,
                status: 'pending',
                lastVerifiedAt: null,
                lastError: null,
                lastErrorAt: null,
                toolCount: 0,
              },
            ],
          };
        }),
      ];
    },
    invalidateKeys: () => (appUuid ? [['app', appUuid], ['connectors']] : [['connectors']]),
    successToast: (_, vars) => `${vars.displayName} added`,
  });
}
