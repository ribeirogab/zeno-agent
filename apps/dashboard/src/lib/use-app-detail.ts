/**
 * App detail hook for the C8 page. Spec 0045.
 *
 * Pairs with backend endpoint `GET /api/connectors/apps/:appUuid` (registered
 * BEFORE the dynamic `:id` route to avoid collision).
 */

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export interface AppDetail {
  app: {
    id: string;
    appId: string;
    catalogId: string;
    appName: string;
    appSlug: string;
    pemSha256: string;
    createdAt: string;
    updatedAt: string;
    /** Spec 0048 Q2. */
    lastRefreshErrorAt?: string | null;
    /** Spec 0048 Q2. */
    lastRefreshErrorMessage?: string | null;
  };
  installations: Array<{
    connectorId: string;
    slug: string;
    displayName: string;
    installationId: string | null;
    status: 'enabled' | 'disabled' | 'pending';
    lastVerifiedAt: string | null;
    lastError: string | null;
    lastErrorAt: string | null;
    toolCount: number;
  }>;
}

export function useAppDetail(appUuid: string | undefined) {
  return useQuery({
    queryKey: ['app', appUuid],
    queryFn: () => apiFetch<AppDetail>(`/api/connectors/apps/${appUuid}`),
    enabled: !!appUuid,
    // Spec 0048 Q2: 30s polling so a DEGRADED state recovers visually within
    // the polling cadence after the worker's next successful refresh.
    refetchInterval: 30_000,
  });
}
