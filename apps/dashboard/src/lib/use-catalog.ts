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
}

export function useCatalog() {
  return useQuery({
    queryKey: ['catalog'],
    queryFn: () => apiFetch<CatalogEntryApi[]>('/api/connectors/catalog'),
    staleTime: 60 * 60 * 1000, // 1h
    refetchOnWindowFocus: true,
  });
}
