/**
 * Spec 0071: TanStack Query hooks for the backends UI surface.
 *
 * Endpoints live at /api/backends/*. The list response merges the
 * agent/backends-catalog.json static metadata with per-backend status from
 * the encrypted backend_credentials table.
 *
 * The dashboard polls the list every 30s so a server-side `auth_expired`
 * (set by the worker) flips the sidebar status dot red within ~30s without
 * needing a long-lived stream.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@zeno/ui';
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

export function useBackends() {
  return useQuery({
    queryKey: backendsKeys.list(),
    queryFn: () => apiFetch<BackendsResponse>('/api/backends'),
    // 30s poll keeps the sidebar status dot fresh without an SSE stream.
    refetchInterval: 30_000,
  });
}

export function useBackend(id: string | undefined) {
  return useQuery({
    queryKey: id ? backendsKeys.detail(id) : ['backends', 'noop'],
    queryFn: () => apiFetch<BackendListItem>(`/api/backends/${id}`),
    enabled: !!id,
  });
}

// ─────────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────────

export interface SaveBackendCredentialsInput {
  backendId: string;
  token: string;
}

/** Paste-token path: regex-validated client-side, then verified by the server. */
export function useSaveBackendCredentials() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (input: SaveBackendCredentialsInput) =>
      apiFetch<{ ok: true; status: BackendStatus }>(
        `/api/backends/${input.backendId}/credentials`,
        {
          method: 'POST',
          body: JSON.stringify({ token: input.token }),
        },
      ),
    onSuccess: () => {
      toast.success('Claude connected');
      qc.invalidateQueries({ queryKey: backendsKeys.list() });
    },
    onError: (err) => toast.fail(formatBackendError(err)),
  });
}

export function useStartOAuth() {
  return useMutation({
    mutationFn: (backendId: string) =>
      apiFetch<{ session_id: string }>(`/api/backends/${backendId}/oauth/start`, {
        method: 'POST',
      }),
  });
}

export function useCancelOAuth() {
  return useMutation({
    mutationFn: (input: { backendId: string; sessionId: string }) =>
      apiFetch<{ ok: true }>(`/api/backends/${input.backendId}/oauth/${input.sessionId}/cancel`, {
        method: 'POST',
      }),
  });
}

export function useSetActiveBackend() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (backendId: string) =>
      apiFetch<{ ok: true }>('/api/backends/active', {
        method: 'PUT',
        body: JSON.stringify({ backend_id: backendId }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: backendsKeys.list() }),
    onError: (err) => toast.fail(formatBackendError(err)),
  });
}
