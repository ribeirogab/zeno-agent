import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export type ConnectorTransport = 'stdio' | 'remote';
export type ConnectorSource = 'catalog' | 'custom';
export type ConnectorStatus = 'enabled' | 'disabled' | 'pending';
export type ToolCategory = 'read' | 'write' | 'interactive';
export type ToolPermission = 'always_allow' | 'ask' | 'never';

export interface ConnectorListItem {
  id: string;
  slug: string;
  displayName: string;
  description: string | null;
  source: ConnectorSource;
  catalogId: string | null;
  iconUrl: string | null;
  transport: ConnectorTransport;
  status: ConnectorStatus;
  lastError: string | null;
  lastErrorAt: string | null;
  lastVerifiedAt: string | null;
  toolCount: number;
  invocationCount24h: number;
}

export interface MaskedSecret {
  key: string;
  masked: true;
  last4: string;
}

export interface ConnectorToolApi {
  toolName: string;
  description: string | null;
  category: ToolCategory;
  permission: ToolPermission;
}

export interface ConnectorDetail extends ConnectorListItem {
  command: string | null;
  args: string[] | null;
  url: string | null;
  secrets: MaskedSecret[];
  tools: ConnectorToolApi[];
}

export interface ConnectorInvocationApi {
  id: number;
  connectorId: string;
  toolName: string;
  threadId: string | null;
  correlationId: string | null;
  result: 'ok' | 'error';
  durationMs: number;
  errorMessage: string | null;
  createdAt: string;
}

export function useConnectors() {
  return useQuery({
    queryKey: ['connectors'],
    queryFn: () => apiFetch<ConnectorListItem[]>('/api/connectors'),
  });
}

export function useConnector(id: string | undefined) {
  return useQuery({
    queryKey: ['connectors', id],
    queryFn: () => apiFetch<ConnectorDetail>(`/api/connectors/${id}`),
    enabled: !!id,
  });
}

export function useConnectorActivity(id: string | undefined) {
  return useQuery({
    queryKey: ['connectors', id, 'activity'],
    queryFn: () => apiFetch<ConnectorInvocationApi[]>(`/api/connectors/${id}/activity`),
    enabled: !!id,
  });
}
