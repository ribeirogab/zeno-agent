/**
 * Spec 2026-05-11-channels-cli-first §A7 — read-only TanStack Query hooks
 * for the channels UI surface.
 *
 * Channels are stored in the connectors table with kind='channel' (spec 0057);
 * the dashboard treats them as a parallel section to /connectors with their
 * own routes, hooks, and components. After the CLI-first rewrite, the
 * dashboard never mutates — every action chip opens a `<CommandModal>` with
 * the equivalent `zeno channel …` command. The previous mutation hooks
 * (`useInstallChannel`, `useEditChannelSecrets`, `useUninstallChannel`) were
 * deleted in this spec; do not reintroduce them. Mutations live in the CLI.
 *
 * Catalog response shape gotcha: GET /api/channels/catalog returns
 * `{ channels: [...] }` (wrapped object), NOT a flat array like the connectors
 * catalog. Do NOT copy the connectors useCatalog pattern verbatim — use
 * `apiFetch<{ channels: ChannelCatalogEntry[] }>(...)` and reach into `.channels`.
 *
 * RQ keys live in their own namespace (`['channels', ...]`) to avoid stale-data
 * collisions with `['connectors']` / `['catalog']`.
 */

import { useQuery } from '@tanstack/react-query';
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

export const channelsKeys = {
  all: ['channels'] as const,
  list: () => [...channelsKeys.all] as const,
  detail: (id: string) => [...channelsKeys.all, id] as const,
  catalog: () => [...channelsKeys.all, 'catalog'] as const,
};

// ─────────────────────────────────────────────────────────────────
// Read hooks
// ─────────────────────────────────────────────────────────────────

export interface UseChannelsOptions {
  /**
   * `'normal'` — 30s refetch interval (the /channels page default).
   * `'fast'`   — 2s refetch interval, matching the ChannelManager poll tick,
   *              for callers that need near-real-time reconciliation feedback
   *              after a CLI mutation lands.
   */
  poll?: 'normal' | 'fast';
}

export function useChannels(opts: UseChannelsOptions = {}) {
  const refetchInterval = opts.poll === 'fast' ? 2000 : 30000;
  return useQuery({
    queryKey: channelsKeys.list(),
    queryFn: () => apiFetch<ChannelListItem[]>('/api/channels'),
    refetchInterval,
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
