// Per-command JSON output schemas. Documented in apps/docs/content/docs/cli.mdx.
// No envelope; the contract is the per-command shape.

import type { Status } from '../lib/output.js';

export interface ProfileListItem {
  name: string;
  port: number;
  status: Status;
  uptimeMs: number | null;
  sticky: boolean;
}

export interface ConnectorListItem {
  slug: string;
  catalogId: string | null;
  status: 'enabled' | 'disabled';
  toolCount: number;
  displayName?: string;
}

export interface CatalogListItem {
  id: string;
  displayName?: string;
  multiInstance?: boolean;
  installed: boolean;
}

export interface SecretListItem {
  key: string;
  masked: boolean;
  last4?: string;
}

export interface ToolListItem {
  name: string;
  permission: 'always_allow' | 'ask' | 'never';
  category?: 'read' | 'write' | 'interactive';
}

export interface StatusJson {
  name: string;
  port: number;
  state: Status;
  uptimeMs: number;
  connectorCount: number | null;
  lastCron: unknown | null;
  lastError: unknown | null;
}
