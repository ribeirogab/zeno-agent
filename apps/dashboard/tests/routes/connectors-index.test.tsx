import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { useConnectorsMock, useCatalogMock } = vi.hoisted(() => ({
  useConnectorsMock: vi.fn(),
  useCatalogMock: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  createFileRoute: () => (config: { component: () => ReactNode }) => ({
    options: config,
  }),
}));

vi.mock('@/lib/use-connectors', () => ({
  useConnectors: () => useConnectorsMock(),
}));

vi.mock('@/lib/use-catalog', () => ({
  useCatalog: () => useCatalogMock(),
}));

import { Route } from '@/routes/_authed/connectors.index';

const Component = Route.options.component as () => JSX.Element;

const sentry = {
  kind: 'connector' as const,
  id: 'sentry-1',
  slug: 'sentry-default',
  displayName: 'Sentry',
  instanceLabel: null,
  description: 'error tracking & monitoring',
  source: 'catalog' as const,
  catalogId: 'sentry',
  iconUrl: null,
  transport: 'stdio' as const,
  status: 'enabled' as const,
  lastError: null,
  lastErrorAt: null,
  lastVerifiedAt: new Date(Date.now() - 60_000).toISOString(),
  toolCount: 12,
  invocationCount24h: 0,
  appId: null,
};

const linearGroup = {
  kind: 'connector_group' as const,
  catalogId: 'linear',
  name: 'linear',
  iconUrl: null,
  installationCount: 3,
  statusAggregate: 'active' as const,
  lastVerifiedAt: new Date(Date.now() - 60_000).toISOString(),
  installations: [
    {
      connectorId: 'lin-1',
      slug: 'linear-acme',
      displayName: 'Linear (Acme)',
      instanceLabel: 'Acme workspace',
      status: 'enabled' as const,
      lastVerifiedAt: new Date(Date.now() - 60_000).toISOString(),
      lastError: null,
      lastErrorAt: null,
    },
    {
      connectorId: 'lin-2',
      slug: 'linear-personal',
      displayName: 'Linear (Personal)',
      instanceLabel: 'Personal',
      status: 'enabled' as const,
      lastVerifiedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
      lastError: null,
      lastErrorAt: null,
    },
    {
      connectorId: 'lin-3',
      slug: 'linear-side',
      displayName: 'Linear (Side)',
      instanceLabel: 'Side-project',
      status: 'disabled' as const,
      lastVerifiedAt: new Date(Date.now() - 60 * 60_000).toISOString(),
      lastError: null,
      lastErrorAt: null,
    },
  ],
};

const githubApp = {
  kind: 'app' as const,
  appUuid: 'app-uuid-1',
  appId: '123456',
  catalogId: 'github-app',
  appName: 'Acme Corp App',
  appSlug: 'acme-corp-app',
  iconUrl: null,
  installationCount: 2,
  statusAggregate: 'active' as const,
  lastVerifiedAt: null,
  lastRefreshErrorAt: null,
  lastRefreshErrorMessage: null,
  installations: [
    {
      connectorId: 'inst-1',
      slug: 'github-app-acmebooks',
      displayName: 'AcmeBooks',
      status: 'enabled' as const,
      lastVerifiedAt: new Date(Date.now() - 60_000).toISOString(),
      lastError: null,
      lastErrorAt: null,
    },
    {
      connectorId: 'inst-2',
      slug: 'github-app-acmeshop',
      displayName: 'AcmeShop',
      status: 'enabled' as const,
      lastVerifiedAt: new Date(Date.now() - 2 * 60_000).toISOString(),
      lastError: null,
      lastErrorAt: null,
    },
  ],
};

const catalogFixture = [
  {
    id: 'github',
    name: 'github',
    description: 'github access via personal token',
    iconUrl: '/icons/github.svg',
    docsUrl: '',
    transport: 'stdio' as const,
    secrets: [],
    toolCount: 12,
    isInstalled: false,
    customInstallComponent: null,
    multiInstance: true,
  },
];

afterEach(() => {
  cleanup();
  useConnectorsMock.mockReset();
  useCatalogMock.mockReset();
});

describe('<ConnectorsIndexScreen> — empty state (A1b)', () => {
  beforeEach(() => {
    useConnectorsMock.mockReturnValue({ data: [], isLoading: false });
    useCatalogMock.mockReturnValue({ data: catalogFixture, isLoading: false });
  });

  it('renders the empty-state card with copy + CLI hint', () => {
    render(<Component />);
    expect(screen.getByText(/No connectors installed/i)).toBeDefined();
    expect(screen.getByText(/Browse the catalog to install/i)).toBeDefined();
    expect(screen.getByText(/zeno connector install/i)).toBeDefined();
  });

  it('exposes the [BROWSE CATALOG] button', () => {
    render(<Component />);
    expect(screen.getByRole('button', { name: /browse catalog/i })).toBeDefined();
  });

  it('opens the CatalogModal when [BROWSE CATALOG] is clicked', () => {
    render(<Component />);
    fireEvent.click(screen.getByRole('button', { name: /browse catalog/i }));
    expect(screen.getAllByText(/catalog/i).length).toBeGreaterThan(0);
    expect(screen.getByLabelText('search catalog')).toBeDefined();
  });
});

describe('<ConnectorsIndexScreen> — populated state (A1)', () => {
  beforeEach(() => {
    useConnectorsMock.mockReturnValue({
      data: [sentry, linearGroup, githubApp],
      isLoading: false,
    });
    useCatalogMock.mockReturnValue({ data: catalogFixture, isLoading: false });
  });

  it('renders one card per top-level item', () => {
    render(<Component />);
    // Sentry single
    expect(screen.getAllByText('Sentry').length).toBeGreaterThanOrEqual(1);
    // Linear group counter
    expect(screen.getByText('3 instances')).toBeDefined();
    // GitHub App identity slot
    expect(screen.getByText('123456')).toBeDefined();
    expect(screen.getByText('2 installations')).toBeDefined();
  });

  it('shows the section summary with the total instance count', () => {
    render(<Component />);
    // 1 (sentry) + 3 (linear group) + 2 (app) = 6
    // Summary now interleaves status counts: "6 instances · N active · …"
    expect(screen.getByText(/6 instances/)).toBeDefined();
  });
});
