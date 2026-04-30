/**
 * Spec 0059: TanStack Query hooks for the channels UI surface.
 *
 * Channels are stored in the connectors table with kind='channel' (spec 0057);
 * the dashboard treats them as a parallel section to /connectors with their
 * own routes, hooks, and components.
 *
 * Catalog response shape gotcha: GET /api/channels/catalog returns
 * `{ channels: [...] }` (wrapped object), NOT a flat array like the connectors
 * catalog. Do NOT copy the connectors useCatalog pattern verbatim — use
 * `apiFetch<{ channels: ChannelCatalogEntry[] }>(...)` and reach into `.channels`.
 *
 * RQ keys live in their own namespace (`['channels', ...]`) to avoid stale-data
 * collisions with `['connectors']` / `['catalog']`.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export type ChannelStatus = 'enabled' | 'disabled' | 'pending';

export interface ChannelListItem {
  id: string;
  slug: string;
  catalogId: string;
  displayName: string;
  description: string | null;
  status: ChannelStatus;
  lastError: string | null;
  lastErrorAt: string | null;
  lastVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChannelMaskedSecret {
  key: string;
  masked: true;
  last4: string;
}

export interface ChannelDetail extends ChannelListItem {
  iconUrl: string | null;
  secrets: ChannelMaskedSecret[];
}

export interface ChannelCatalogSecretField {
  key: string;
  label: string;
  help?: string;
  required: boolean;
  inputType?: 'text' | 'password';
}

export interface ChannelCatalogEntry {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  iconUrl: string;
  docsUrl?: string | null;
  secrets: ChannelCatalogSecretField[];
}

export interface ChannelSetupHelper {
  steps: Array<{ index: number; html: string }>;
  manifest: { filename: string; content: string } | null;
}

export const channelsKeys = {
  all: ['channels'] as const,
  list: () => [...channelsKeys.all] as const,
  detail: (id: string) => [...channelsKeys.all, id] as const,
  catalog: () => [...channelsKeys.all, 'catalog'] as const,
  setupHelper: (catalogId: string) => [...channelsKeys.all, 'catalog', 'setup', catalogId] as const,
};

// ─────────────────────────────────────────────────────────────────
// Read hooks
// ─────────────────────────────────────────────────────────────────

export function useChannels() {
  return useQuery({
    queryKey: channelsKeys.list(),
    queryFn: () => apiFetch<ChannelListItem[]>('/api/channels'),
  });
}

export function useChannel(id: string | undefined) {
  return useQuery({
    queryKey: id ? channelsKeys.detail(id) : ['channels', 'noop'],
    queryFn: () => apiFetch<ChannelDetail>(`/api/channels/${id}`),
    enabled: !!id,
  });
}

export function useChannelsCatalog() {
  return useQuery({
    queryKey: channelsKeys.catalog(),
    queryFn: async () => {
      // /api/channels/catalog returns { channels: [...] } (wrapped),
      // NOT a flat array — see file header.
      const wrapped = await apiFetch<{ channels: ChannelCatalogEntry[] }>('/api/channels/catalog');
      return wrapped.channels;
    },
  });
}

export function useChannelSetupHelper(catalogId: string | null | undefined) {
  return useQuery({
    queryKey: catalogId ? channelsKeys.setupHelper(catalogId) : ['channels', 'setup', 'noop'],
    queryFn: () => apiFetch<ChannelSetupHelper>(`/api/channels/catalog/setup/${catalogId}`),
    enabled: !!catalogId,
  });
}

// ─────────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────────

export interface InstallChannelInput {
  catalogId: string;
  secrets: Array<{ key: string; value: string }>;
}

/**
 * Install hits the existing POST /api/connectors endpoint with kind='channel'
 * (spec 0057), not a channels-specific endpoint. The worker validates against
 * the catalog and binds the row asynchronously; the modal polls /api/channels
 * for the row to appear (success predicate: catalogId match).
 */
export function useInstallChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: InstallChannelInput) =>
      apiFetch<void>('/api/connectors', {
        method: 'POST',
        body: JSON.stringify({
          source: 'catalog',
          kind: 'channel',
          catalogId: input.catalogId,
          secrets: input.secrets,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: channelsKeys.list() });
    },
  });
}

export interface EditChannelSecretsInput {
  channelId: string;
  /**
   * Only changed keys — the backend's mode='merge' overlay preserves
   * unchanged keys so the UI never has to read plaintext for fields the
   * operator didn't touch.
   */
  secrets: Array<{ key: string; value: string }>;
}

export function useEditChannelSecrets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EditChannelSecretsInput) =>
      apiFetch<void>(`/api/channels/${input.channelId}/secrets`, {
        method: 'PATCH',
        body: JSON.stringify({ mode: 'merge', secrets: input.secrets }),
      }),
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: channelsKeys.detail(input.channelId) });
      qc.invalidateQueries({ queryKey: channelsKeys.list() });
    },
  });
}

export function useUninstallChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (channelId: string) =>
      apiFetch<void>(`/api/channels/${channelId}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: channelsKeys.list() });
    },
  });
}
