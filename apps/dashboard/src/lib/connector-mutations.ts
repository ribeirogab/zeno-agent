import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@zeno/ui';
import { apiFetch } from '@/lib/api-client';
import { formatError } from '@/lib/format-error';
import type {
  ConnectorDetail,
  ConnectorListItem,
  ToolCategory,
  ToolPermission,
} from '@/lib/use-connectors';
import {
  cacheChange,
  type OptimisticCacheChange,
  useOptimisticMutation,
} from '@/lib/use-optimistic-mutation';

// ─── Toggle (direct write) ────────────────────────────────────────────

export function useToggleConnector() {
  return useOptimisticMutation<
    { id: string; current: 'enabled' | 'disabled' },
    { status: 'enabled' | 'disabled' }
  >({
    mutationFn: ({ id }) =>
      apiFetch<{ status: 'enabled' | 'disabled' }>(`/api/connectors/${id}/toggle`, {
        method: 'PATCH',
      }),
    optimisticUpdate: ({ id, current }) => {
      const next = current === 'enabled' ? 'disabled' : 'enabled';
      const updates: OptimisticCacheChange[] = [
        cacheChange<ConnectorListItem[]>(['connectors'], (prev) =>
          prev?.map((c) => (c.id === id ? { ...c, status: next } : c)),
        ),
        cacheChange<ConnectorDetail>(['connectors', id], (prev) =>
          prev ? { ...prev, status: next } : prev,
        ),
      ];
      return updates;
    },
    invalidateKeys: ({ id }) => [['connectors'], ['connectors', id]],
    successToast: 'connector toggled',
  });
}

// ─── Per-tool permission (direct write, optimistic) ───────────────────

export function useSetToolPermission() {
  return useOptimisticMutation<
    { connectorId: string; toolName: string; permission: ToolPermission },
    void
  >({
    mutationFn: ({ connectorId, toolName, permission }) =>
      apiFetch<void>(
        `/api/connectors/${connectorId}/tools/${encodeURIComponent(toolName)}/permission`,
        {
          method: 'PATCH',
          body: JSON.stringify({ permission }),
        },
      ),
    optimisticUpdate: ({ connectorId, toolName, permission }) => [
      cacheChange<ConnectorDetail>(['connectors', connectorId], (prev) =>
        prev
          ? {
              ...prev,
              tools: prev.tools.map((t) => (t.toolName === toolName ? { ...t, permission } : t)),
            }
          : prev,
      ),
    ],
    invalidateKeys: ({ connectorId }) => [['connectors', connectorId]],
  });
}

// ─── Bulk permission ──────────────────────────────────────────────────

export function useSetBulkPermission() {
  return useOptimisticMutation<
    { connectorId: string; category: ToolCategory; permission: ToolPermission },
    { rowsAffected: number }
  >({
    mutationFn: ({ connectorId, category, permission }) =>
      apiFetch<{ rowsAffected: number }>(`/api/connectors/${connectorId}/tools/permissions/bulk`, {
        method: 'PATCH',
        body: JSON.stringify({ category, permission }),
      }),
    optimisticUpdate: ({ connectorId, category, permission }) => [
      cacheChange<ConnectorDetail>(['connectors', connectorId], (prev) =>
        prev
          ? {
              ...prev,
              tools: prev.tools.map((t) => (t.category === category ? { ...t, permission } : t)),
            }
          : prev,
      ),
    ],
    invalidateKeys: ({ connectorId }) => [['connectors', connectorId]],
  });
}

// ─── Test connection (transient — not yet saved) ──────────────────────

export interface TestConnectionRequest {
  transport: 'stdio' | 'remote';
  command?: string;
  args?: string[];
  url?: string;
  secrets: Array<{ key: string; value: string }>;
}

export interface DiscoveredToolApi {
  name: string;
  description: string | null;
  category: ToolCategory;
}

export type TestConnectionResponse =
  | { ok: true; tools: DiscoveredToolApi[]; durationMs: number }
  | { ok: false; errorKind: 'auth' | 'network' | 'timeout' | 'spawn' | 'unknown'; error: string };

/** Custom Add flow — full transport details come from the form. */
export function useTestConnection() {
  return useMutation<TestConnectionResponse, Error, TestConnectionRequest>({
    mutationFn: (body) =>
      apiFetch<TestConnectionResponse>('/api/connectors/test', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  });
}

/** Catalog Add flow — server resolves transportConfig from the catalog entry. */
export function useTestCatalogConnection() {
  return useMutation<
    TestConnectionResponse,
    Error,
    { catalogId: string; secrets: Array<{ key: string; value: string }> }
  >({
    mutationFn: ({ catalogId, secrets }) =>
      apiFetch<TestConnectionResponse>(`/api/connectors/catalog/${catalogId}/test`, {
        method: 'POST',
        body: JSON.stringify({ secrets }),
      }),
  });
}

// ─── Test installed connector (persists) ──────────────────────────────

export function useTestInstalledConnector() {
  const qc = useQueryClient();
  return useMutation<TestConnectionResponse, Error, { id: string }>({
    mutationFn: ({ id }) =>
      apiFetch<TestConnectionResponse>(`/api/connectors/${id}/test`, { method: 'POST' }),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['connectors'] });
      qc.invalidateQueries({ queryKey: ['connectors', id] });
    },
  });
}

// ─── Create (catalog) ─────────────────────────────────────────────────

export interface CreateCatalogConnectorInput {
  catalogId: string;
  secrets: Array<{ key: string; value: string }>;
}

export function useCreateCatalogConnector() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation<void, Error, CreateCatalogConnectorInput>({
    mutationFn: (body) =>
      apiFetch<void>('/api/connectors', {
        method: 'POST',
        body: JSON.stringify({ source: 'catalog', ...body }),
      }),
    onSuccess: () => {
      toast.success('connector adicionado');
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['connectors'] });
        qc.invalidateQueries({ queryKey: ['catalog'] });
      }, 1500);
    },
    onError: (err) => toast.fail(formatError(err)),
  });
}

// ─── Refresh tools ────────────────────────────────────────────────────

export function useRefreshTools() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation<void, Error, { id: string }>({
    mutationFn: ({ id }) =>
      apiFetch<void>(`/api/connectors/${id}/refresh-tools`, { method: 'POST' }),
    onSuccess: (_data, { id }) => {
      toast.success('tools atualizando…');
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['connectors', id] });
      }, 1500);
    },
    onError: (err) => toast.fail(formatError(err)),
  });
}

// ─── Uninstall ────────────────────────────────────────────────────────

export function useUninstallConnector() {
  return useOptimisticMutation<{ id: string }, void>({
    mutationFn: ({ id }) => apiFetch<void>(`/api/connectors/${id}`, { method: 'DELETE' }),
    optimisticUpdate: ({ id }) => [
      cacheChange<ConnectorListItem[]>(['connectors'], (prev) => prev?.filter((c) => c.id !== id)),
    ],
    // Spec 0051 Phase C lands the user on `/connectors/github-app` after
    // uninstalling a github-app installation. The App-detail cache key is
    // `['app', appUuid]` (see `use-app-detail.ts`); invalidate the whole
    // `['app']` prefix so every variant gets refetched on arrival.
    invalidateKeys: () => [['connectors'], ['catalog'], ['app']],
    invalidateDelayMs: 1500,
    successToast: 'connector removido',
  });
}

// ─── Reveal secret ────────────────────────────────────────────────────

export function useRevealSecret() {
  return useMutation<{ value: string }, Error, { id: string; key: string }>({
    mutationFn: ({ id, key }) =>
      apiFetch<{ value: string }>(
        `/api/connectors/${id}/secrets/${encodeURIComponent(key)}/reveal`,
      ),
  });
}
