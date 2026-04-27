import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export type ConnectorTransport = 'stdio' | 'remote';
export type ConnectorSource = 'catalog' | 'custom';
export type ConnectorStatus = 'enabled' | 'disabled' | 'pending';
export type ToolCategory = 'read' | 'write' | 'interactive';
export type ToolPermission = 'always_allow' | 'ask' | 'never';

// Spec 0045: discriminated union — every list entry carries a `kind` field.
// Standalone connectors are `kind: 'connector'`; collapsed App rows (github-app)
// are `kind: 'app'` with a nested installations array.

export interface ConnectorListItem {
  /** Discriminator — REQUIRED by backend (spec 0045). */
  kind: 'connector';
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
  /**
   * Spec 0044/0045: FK to connector_apps.id. Null for standalone connectors.
   * Sent by backend on every list item (R1-restart-2 F2). Used by detail
   * page's InheritedAppCallout via `c.appId != null`.
   */
  appId: string | null;
}

export interface AppNestedInstallation {
  connectorId: string;
  slug: string;
  displayName: string;
  status: ConnectorStatus;
  lastVerifiedAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
}

export interface AppListItem {
  kind: 'app';
  appUuid: string;
  /** Numeric GitHub App id (e.g. '12345'). */
  appId: string;
  catalogId: string;
  appName: string;
  appSlug: string;
  iconUrl: string | null;
  installationCount: number;
  /** Spec 0048 Q2: `degraded` (amber) when refresh failed in the last 1h. */
  statusAggregate: 'active' | 'mixed' | 'error' | 'degraded';
  lastVerifiedAt: string | null;
  /** Spec 0048 Q2: ISO timestamp of the most recent refresh failure (null on success). */
  lastRefreshErrorAt: string | null;
  /** Spec 0048 Q2: brief error message from the most recent refresh failure. */
  lastRefreshErrorMessage: string | null;
  installations: AppNestedInstallation[];
}

export type ConnectorListEntry = ConnectorListItem | AppListItem;

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
    queryFn: () => apiFetch<ConnectorListEntry[]>('/api/connectors'),
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
