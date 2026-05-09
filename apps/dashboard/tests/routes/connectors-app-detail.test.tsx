import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Tanstack Router stubs — same trick as the other connectors-* route tests.
const { useParamsMock, useConnectorsMock, useAppDetailMock } = vi.hoisted(() => ({
  useParamsMock: vi.fn(() => ({ catalogId: 'github-app', id: 'app-uuid-1' })),
  useConnectorsMock: vi.fn(),
  useAppDetailMock: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  createFileRoute: () => (config: { component: () => ReactNode }) => ({
    options: config,
    useParams: useParamsMock,
  }),
}));

vi.mock('@/lib/use-connectors', () => ({
  useConnectors: () => useConnectorsMock(),
  useConnector: () => ({ data: undefined, error: null, isLoading: false }),
  useConnectorActivity: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/lib/use-app-detail', () => ({
  useAppDetail: () => useAppDetailMock(),
}));

import { Route } from '@/routes/_authed/connectors.$catalogId.$id';

const Component = Route.options.component as () => JSX.Element;

const appDetailFixture = {
  app: {
    id: 'app-uuid-1',
    appId: '123456',
    catalogId: 'github-app',
    appName: 'Acme Corp App',
    appSlug: 'acme-corp-app',
    pemSha256: 'a3f9c4b29f8d7e6c5b4a3f9c4b29f8d7e6c5b4a3f9c4b29f8d7e6c5b4a3f9c4b2',
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString(),
    updatedAt: new Date(Date.now() - 12 * 60_000).toISOString(),
    lastRefreshErrorAt: null,
    lastRefreshErrorMessage: null,
  },
  installations: [
    {
      connectorId: 'inst-1',
      slug: 'github-app-acmebooks',
      displayName: 'GitHub App — AcmeBooks',
      installationId: '70001',
      status: 'enabled' as const,
      lastVerifiedAt: new Date(Date.now() - 60_000).toISOString(),
      lastError: null,
      lastErrorAt: null,
      toolCount: 51,
    },
    {
      connectorId: 'inst-2',
      slug: 'github-app-acmeshop',
      displayName: 'GitHub App — AcmeShop',
      installationId: '70002',
      status: 'enabled' as const,
      lastVerifiedAt: new Date(Date.now() - 2 * 60_000).toISOString(),
      lastError: null,
      lastErrorAt: null,
      toolCount: 51,
    },
    {
      connectorId: 'inst-3',
      slug: 'github-app-acmemobile',
      displayName: 'GitHub App — AcmeMobile',
      installationId: '70003',
      status: 'enabled' as const,
      lastVerifiedAt: new Date(Date.now() - 3 * 60_000).toISOString(),
      lastError: null,
      lastErrorAt: null,
      toolCount: 51,
    },
    {
      connectorId: 'inst-4',
      slug: 'github-app-acmeapi',
      displayName: 'GitHub App — AcmeAPI',
      installationId: '70004',
      status: 'enabled' as const,
      lastVerifiedAt: new Date(Date.now() - 4 * 60_000).toISOString(),
      lastError: null,
      lastErrorAt: null,
      toolCount: 51,
    },
  ],
};

describe('<ConnectorDetailScreen> (A6a App detail branch)', () => {
  beforeEach(() => {
    useConnectorsMock.mockReturnValue({
      data: [
        {
          kind: 'app',
          appUuid: 'app-uuid-1',
          appId: '123456',
          catalogId: 'github-app',
          appName: 'Acme Corp App',
          appSlug: 'acme-corp-app',
          iconUrl: null,
          installationCount: 4,
          statusAggregate: 'active',
          lastVerifiedAt: null,
          lastRefreshErrorAt: null,
          lastRefreshErrorMessage: null,
          installations: [],
        },
      ],
      isLoading: false,
    });
    useAppDetailMock.mockReturnValue({
      data: appDetailFixture,
      error: null,
      isLoading: false,
    });
  });

  afterEach(() => {
    cleanup();
    useConnectorsMock.mockReset();
    useAppDetailMock.mockReset();
  });

  it('renders the kicker with APP · GITHUB-APP', () => {
    render(<Component />);
    expect(screen.getByText(/APP · GITHUB-APP/i)).toBeDefined();
  });

  it('renders the App name as the page title', () => {
    render(<Component />);
    expect(screen.getByRole('heading', { level: 1, name: 'Acme Corp App' })).toBeDefined();
  });

  it('renders the App ID in the identity card', () => {
    render(<Component />);
    expect(screen.getByText('123456')).toBeDefined();
  });

  it('renders the PEM fingerprint in the identity card', () => {
    render(<Component />);
    expect(screen.getByText(/^sha256:a3f9·c4b2·9f8d·7e6c·5b4a·3f9c…$/)).toBeDefined();
  });

  it('renders the 3 header action buttons (DISCOVER, ADD INSTALLATION, UNINSTALL APP)', () => {
    render(<Component />);
    expect(screen.getByRole('button', { name: /discover/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /add installation/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /uninstall app/i })).toBeDefined();
  });

  it('renders the 4 installations rows', () => {
    render(<Component />);
    expect(screen.getByText('AcmeBooks')).toBeDefined();
    expect(screen.getByText('AcmeShop')).toBeDefined();
    expect(screen.getByText('AcmeMobile')).toBeDefined();
    expect(screen.getByText('AcmeAPI')).toBeDefined();
  });

  it('summary shows 4 installations · 4 active', () => {
    render(<Component />);
    expect(screen.getByText(/4 installations · 4 active/i)).toBeDefined();
  });
});
