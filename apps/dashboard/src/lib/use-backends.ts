/**
 * Spec 0071 / 0072: TanStack Query hooks for the backends UI surface.
 *
 * Endpoints live at /api/backends/*. The list response merges the
 * agent/backends-catalog.json static metadata with per-backend status from
 * the encrypted backend_credentials table.
 *
 * Dashboard polls the list every 30s by default so a CLI-driven status
 * change converges without an SSE stream. The /onboarding/connect-backend
 * page passes `{ poll: 'fast' }` to tighten the cadence to 2s while the
 * operator is mid-CLI-flow.
 *
 * Mutation hooks (save/oauth-start/oauth-cancel/set-active) were dropped
 * in spec 0072 — backend mutation is CLI-only now. The api-side routes
 * those hooks called are deleted in the same PR.
 */

import { useQuery } from '@tanstack/react-query';
import { ApiError, apiFetch } from '@/lib/api-client';

function formatBackendError(err: unknown): string {
  if (err instanceof ApiError && err.body && typeof err.body === 'object') {
    const body = err.body as { error?: unknown; message?: unknown; hint?: unknown };
    if (typeof body.error === 'string')
      return body.hint ? `${body.error} — ${body.hint}` : body.error;
    if (typeof body.message === 'string') return body.message;
  }
  if (err instanceof Error) return err.message;
  return 'unknown error';
}

export type BackendStatus = 'not_configured' | 'untested' | 'active' | 'expired' | 'failed';

export interface BackendAuthField {
  field: string;
  label: string;
  type: 'password' | 'text';
  regex?: string;
  regex_hint?: string;
}

export interface BackendListItem {
  id: string;
  name: string;
  description: string;
  logo: string;
  logoUrl: string;
  setup_doc_url: string;
  auth_schema: BackendAuthField[];
  status: BackendStatus;
  last_tested_at: number | null;
  last_auth_alert_at: number | null;
}

export interface BackendsResponse {
  /** Spec 0071: active profile id (from ZENO_PROFILE), surfaced so the card meta row shows the right scope. */
  profile_id: string;
  active_backend_id: string | null;
  backends: BackendListItem[];
}

export const backendsKeys = {
  all: ['backends'] as const,
  list: () => [...backendsKeys.all] as const,
  detail: (id: string) => [...backendsKeys.all, id] as const,
};

export interface UseBackendsOpts {
  /**
   * 'normal' (30s, default) for /backend + sidebar dot; 'fast' (2s) for the
   * onboarding hero so CLI-driven changes appear within one cycle.
   */
  poll?: 'normal' | 'fast';
}

export function useBackends(opts: UseBackendsOpts = {}) {
  const refetchInterval = opts.poll === 'fast' ? 2_000 : 30_000;
  return useQuery({
    queryKey: backendsKeys.list(),
    queryFn: () => apiFetch<BackendsResponse>('/api/backends'),
    refetchInterval,
  });
}

export function useBackend(id: string | undefined) {
  return useQuery({
    queryKey: id ? backendsKeys.detail(id) : ['backends', 'noop'],
    queryFn: () => apiFetch<BackendListItem>(`/api/backends/${id}`),
    enabled: !!id,
  });
}

// Spec 0072 — formatBackendError + ApiError are kept on the import surface
// for backwards-compat with consumers that handle the api error shape.
// They are no longer used by mutation hooks (which were deleted).
export { ApiError, formatBackendError };
