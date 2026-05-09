import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

import { ConnectorGroupCard } from '@/components/connector-group-card';
import type { AppListItem, ConnectorGroupListItem, ConnectorListItem } from '@/lib/use-connectors';

afterEach(() => cleanup());

const baseConnector: ConnectorListItem = {
  kind: 'connector',
  id: 'c1',
  slug: 'sentry-default',
  displayName: 'Sentry',
  instanceLabel: null,
  description: 'error tracking & monitoring',
  source: 'catalog',
  catalogId: 'sentry',
  iconUrl: null,
  transport: 'stdio',
  status: 'enabled',
  lastError: null,
  lastErrorAt: null,
  lastVerifiedAt: new Date(Date.now() - 60_000).toISOString(),
  toolCount: 12,
  invocationCount24h: 0,
  appId: null,
};

describe('<ConnectorGroupCard>', () => {
  describe('single connector variant (kind: connector)', () => {
    it('renders the catalog name in the header', () => {
      render(<ConnectorGroupCard item={baseConnector} />);
      expect(screen.getAllByText('Sentry').length).toBeGreaterThanOrEqual(1);
    });

    it('shows "1 instance" counter', () => {
      render(<ConnectorGroupCard item={baseConnector} />);
      expect(screen.getByText('1 instance')).toBeDefined();
    });

    it('renders an active status pill for enabled, no-error rows', () => {
      render(<ConnectorGroupCard item={baseConnector} />);
      expect(screen.getByText('active')).toBeDefined();
    });

    it('surfaces lastError as a sub-line when status is error', () => {
      render(
        <ConnectorGroupCard
          item={{
            ...baseConnector,
            status: 'enabled',
            lastError: '401 unauthorized · check SENTRY_ACCESS_TOKEN',
          }}
        />,
      );
      expect(screen.getByText('error')).toBeDefined();
      expect(screen.getByText(/401 unauthorized/)).toBeDefined();
    });
  });

  describe('connector_group variant (kind: connector_group)', () => {
    const group: ConnectorGroupListItem = {
      kind: 'connector_group',
      catalogId: 'linear',
      name: 'linear',
      iconUrl: null,
      installationCount: 3,
      statusAggregate: 'active',
      lastVerifiedAt: new Date(Date.now() - 60_000).toISOString(),
      installations: [
        {
          connectorId: 'lin-1',
          slug: 'linear-acme',
          displayName: 'Linear (Acme)',
          instanceLabel: 'Acme workspace',
          status: 'enabled',
          lastVerifiedAt: new Date(Date.now() - 60_000).toISOString(),
          lastError: null,
          lastErrorAt: null,
        },
        {
          connectorId: 'lin-2',
          slug: 'linear-personal',
          displayName: 'Linear (Personal)',
          instanceLabel: 'Personal',
          status: 'enabled',
          lastVerifiedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
          lastError: null,
          lastErrorAt: null,
        },
        {
          connectorId: 'lin-3',
          slug: 'linear-side',
          displayName: 'Linear (Side)',
          instanceLabel: 'Side-project',
          status: 'disabled',
          lastVerifiedAt: new Date(Date.now() - 60 * 60_000).toISOString(),
          lastError: null,
          lastErrorAt: null,
        },
      ],
    };

    it('shows the group counter as "3 instances"', () => {
      render(<ConnectorGroupCard item={group} />);
      expect(screen.getByText('3 instances')).toBeDefined();
    });

    it('renders one drill row per installation, using instance_label when set', () => {
      render(<ConnectorGroupCard item={group} />);
      expect(screen.getByText('Acme workspace')).toBeDefined();
      expect(screen.getByText('Personal')).toBeDefined();
      expect(screen.getByText('Side-project')).toBeDefined();
    });

    it('marks the disabled row as off', () => {
      render(<ConnectorGroupCard item={group} />);
      expect(screen.getByText('off')).toBeDefined();
    });
  });

  describe('app variant (kind: app)', () => {
    const app: AppListItem = {
      kind: 'app',
      appUuid: 'app-uuid-1',
      appId: '123456',
      catalogId: 'github-app',
      appName: 'Acme Corp App',
      appSlug: 'acme-corp-app',
      iconUrl: null,
      installationCount: 2,
      statusAggregate: 'active',
      lastVerifiedAt: null,
      lastRefreshErrorAt: null,
      lastRefreshErrorMessage: null,
      installations: [
        {
          connectorId: 'inst-1',
          slug: 'github-app-acmebooks',
          displayName: 'AcmeBooks',
          status: 'enabled',
          lastVerifiedAt: new Date(Date.now() - 60_000).toISOString(),
          lastError: null,
          lastErrorAt: null,
        },
        {
          connectorId: 'inst-2',
          slug: 'github-app-acmeshop',
          displayName: 'AcmeShop',
          status: 'enabled',
          lastVerifiedAt: new Date(Date.now() - 2 * 60_000).toISOString(),
          lastError: null,
          lastErrorAt: null,
        },
      ],
    };

    it('renders the App identity slot with App name and App ID', () => {
      render(<ConnectorGroupCard item={app} />);
      // App name appears both in the header (bold) and in the identity slot.
      expect(screen.getAllByText('Acme Corp App').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('123456')).toBeDefined();
    });

    it('exposes the "view app →" link in the identity slot', () => {
      render(<ConnectorGroupCard item={app} />);
      expect(screen.getByText(/view app/i)).toBeDefined();
    });

    it('shows the installation counter as "2 installations"', () => {
      render(<ConnectorGroupCard item={app} />);
      expect(screen.getByText('2 installations')).toBeDefined();
    });

    it('renders an installation row per installation', () => {
      render(<ConnectorGroupCard item={app} />);
      expect(screen.getByText('AcmeBooks')).toBeDefined();
      expect(screen.getByText('AcmeShop')).toBeDefined();
    });
  });
});
