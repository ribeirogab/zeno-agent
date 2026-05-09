import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Tanstack Router: stub `Link`, `createFileRoute` (returns the component back),
// and `useParams` so the file-based route can be rendered standalone.
//
// `vi.hoisted` is required because `vi.mock` factories are hoisted to the top
// of the file by Vitest. Plain `const` declarations are not, so referencing
// them from inside a factory throws `Cannot access X before initialization`.
const { useParamsMock, useConnectorsMock, useCatalogMock } = vi.hoisted(() => ({
  useParamsMock: vi.fn(() => ({ catalogId: 'linear' })),
  useConnectorsMock: vi.fn(),
  useCatalogMock: vi.fn(),
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
}));

vi.mock('@/lib/use-catalog', () => ({
  useCatalog: () => useCatalogMock(),
}));

import { Route } from '@/routes/_authed/connectors.$catalogId.index';

const Component = Route.options.component as () => JSX.Element;

const baseConnector = {
  kind: 'connector' as const,
  slug: 'linear-acme',
  instanceLabel: null,
  description: 'Acme workspace',
  source: 'catalog' as const,
  catalogId: 'linear',
  iconUrl: null,
  transport: 'remote' as const,
  lastErrorAt: null,
  toolCount: 12,
  invocationCount24h: 0,
  appId: null,
};

describe('<ConnectorLeavesScreen> (A4 plain leaves list)', () => {
  beforeEach(() => {
    useConnectorsMock.mockReturnValue({
      data: [
        {
          ...baseConnector,
          id: 'c1',
          slug: 'linear-acme',
          displayName: 'Acme workspace',
          status: 'enabled',
          lastError: null,
          lastVerifiedAt: new Date(Date.now() - 60_000).toISOString(),
        },
        {
          ...baseConnector,
          id: 'c2',
          slug: 'linear-personal',
          displayName: 'Personal',
          status: 'enabled',
          lastError: null,
          lastVerifiedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
        },
        {
          ...baseConnector,
          id: 'c3',
          slug: 'linear-side',
          displayName: 'Side-project',
          status: 'disabled',
          lastError: null,
          lastVerifiedAt: new Date(Date.now() - 60 * 60_000).toISOString(),
        },
      ],
      isLoading: false,
    });
    useCatalogMock.mockReturnValue({
      data: [
        {
          id: 'linear',
          name: 'Linear',
          description:
            'Linear MCP server. Issues, projects, cycles. Catalog entry; multi-instance.',
          iconUrl: '',
          docsUrl: '',
          transport: 'remote',
          secrets: [],
          toolCount: 12,
          isInstalled: true,
          customInstallComponent: null,
        },
      ],
      isLoading: false,
    });
  });

  afterEach(() => {
    cleanup();
    useConnectorsMock.mockReset();
    useCatalogMock.mockReset();
  });

  it('renders the page header (kicker + title + description)', () => {
    render(<Component />);
    expect(screen.getByText(/connector · plain/i)).toBeDefined();
    expect(screen.getByRole('heading', { level: 1, name: 'Linear' })).toBeDefined();
    expect(screen.getByText(/Linear MCP server\. Issues, projects, cycles\./i)).toBeDefined();
  });

  it('renders all 3 instance labels from the matching catalog group', () => {
    render(<Component />);
    expect(screen.getByText('Acme workspace')).toBeDefined();
    expect(screen.getByText('Personal')).toBeDefined();
    expect(screen.getByText('Side-project')).toBeDefined();
  });

  it('exposes the [INSTALL ANOTHER] button', () => {
    render(<Component />);
    expect(screen.getByRole('button', { name: /install another/i })).toBeDefined();
  });

  it('summary line shows "3 instances · 2 active · 1 off"', () => {
    render(<Component />);
    expect(screen.getByText(/3 instances · 2 active · 1 off/i)).toBeDefined();
  });
});
