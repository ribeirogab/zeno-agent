import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { useParamsMock, useConnectorMock, useConnectorActivityMock, useAppDetailMock } = vi.hoisted(
  () => ({
    useParamsMock: vi.fn(() => ({
      catalogId: 'github-app',
      appId: 'app-uuid-1',
      instanceId: 'inst-1',
    })),
    useConnectorMock: vi.fn(),
    useConnectorActivityMock: vi.fn(),
    useAppDetailMock: vi.fn(),
  }),
);

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  createFileRoute: () => (config: { component: () => ReactNode }) => ({
    options: config,
    useParams: useParamsMock,
  }),
}));

vi.mock('@/lib/use-connectors', () => ({
  useConnector: () => useConnectorMock(),
  useConnectorActivity: () => useConnectorActivityMock(),
}));

vi.mock('@/lib/use-app-detail', () => ({
  useAppDetail: () => useAppDetailMock(),
}));

import { Route } from '@/routes/_authed/connectors.$catalogId.$appId.instances.$instanceId';

const Component = Route.options.component as () => JSX.Element;

const installationFixture = {
  kind: 'connector' as const,
  id: 'inst-1',
  slug: 'github-app-acmebooks',
  displayName: 'GitHub App — AcmeBooks',
  instanceLabel: 'AcmeBooks',
  description: null,
  source: 'catalog' as const,
  catalogId: 'github-app',
  iconUrl: null,
  transport: 'remote' as const,
  status: 'enabled' as const,
  lastError: null,
  lastErrorAt: null,
  lastVerifiedAt: new Date(Date.now() - 60_000).toISOString(),
  toolCount: 12,
  invocationCount24h: 42,
  appId: 'app-uuid-1',
  command: null,
  args: null,
  url: 'https://api.github.com/installations/70001',
  secrets: [{ key: '__GITHUB_INSTALLATION_ID__', masked: true as const, last4: '7890' }],
  tools: [
    {
      toolName: 'get_pull_request',
      description: null,
      category: 'read' as const,
      permission: 'always_allow' as const,
    },
    {
      toolName: 'merge_pull_request',
      description: null,
      category: 'write' as const,
      permission: 'ask' as const,
    },
  ],
};

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
  installations: [],
};

describe('<AppInstallationDetailScreen> (A6b App installation detail)', () => {
  beforeEach(() => {
    useConnectorMock.mockReturnValue({
      data: installationFixture,
      error: null,
      isLoading: false,
    });
    useConnectorActivityMock.mockReturnValue({ data: [], isLoading: false });
    useAppDetailMock.mockReturnValue({
      data: appDetailFixture,
      error: null,
      isLoading: false,
    });
  });

  afterEach(() => {
    cleanup();
    useConnectorMock.mockReset();
    useConnectorActivityMock.mockReset();
    useAppDetailMock.mockReset();
  });

  it('renders the kicker with INSTALLATION · GITHUB-APP', () => {
    render(<Component />);
    expect(screen.getByText(/INSTALLATION · GITHUB-APP/i)).toBeDefined();
  });

  it('renders the installation label as the page title', () => {
    render(<Component />);
    expect(screen.getByRole('heading', { level: 1, name: 'AcmeBooks' })).toBeDefined();
  });

  it('renders the inheritance hint in the description', () => {
    render(<Component />);
    expect(screen.getByText(/inherits PEM from Acme Corp App/i)).toBeDefined();
  });

  it('renders breadcrumb segments github-app and acme-corp-app', () => {
    render(<Component />);
    expect(screen.getByText('github-app')).toBeDefined();
    expect(screen.getByText('acme-corp-app')).toBeDefined();
    expect(screen.getByText('instances')).toBeDefined();
  });

  it('renders the secrets section with the inheritance caption', () => {
    render(<Component />);
    expect(screen.getByText('__GITHUB_INSTALLATION_ID__')).toBeDefined();
    expect(screen.getByText(/inherits PEM from App/i)).toBeDefined();
  });

  it('renders tools section with rows', () => {
    render(<Component />);
    expect(screen.getByText('get_pull_request')).toBeDefined();
    expect(screen.getByText('merge_pull_request')).toBeDefined();
  });

  it('renders the 4 header action buttons (TEST, REFRESH TOOLS, DISABLE, UNINSTALL)', () => {
    render(<Component />);
    expect(screen.getByRole('button', { name: /test/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /refresh tools/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /disable/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /uninstall/i })).toBeDefined();
  });
});
