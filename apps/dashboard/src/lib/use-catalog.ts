import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { ConnectorTransport } from '@/lib/use-connectors';

export interface CatalogSecretApi {
  key: string;
  label: string;
  help: string;
  required: boolean;
}

export interface CatalogEntryApi {
  id: string;
  name: string;
  description: string;
  iconUrl: string;
  docsUrl: string;
  transport: ConnectorTransport;
  secrets: CatalogSecretApi[];
  toolCount: number;
  isInstalled: boolean;
  /** Spec 0042/0045: catalog entry's customInstallComponent id (e.g. 'github-app'). */
  customInstallComponent: string | null;
  /**
   * Spec 2026-05-08-connectors-cli-first-design Q5: false when the catalog
   * entry only supports a single concurrent installation (e.g. playwright).
   * The CatalogModal disables the `+` button + shows a tooltip-banner when
   * `multiInstance === false` and at least one instance already exists.
   */
  multiInstance: boolean;
}

export function useCatalog() {
  return useQuery({
    queryKey: ['catalog'],
    queryFn: () => apiFetch<CatalogEntryApi[]>('/api/connectors/catalog'),
    staleTime: 60 * 60 * 1000, // 1h
    refetchOnWindowFocus: true,
  });
}
