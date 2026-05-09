import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Tanstack Router stubs — same trick as connectors-leaves.test.tsx so the
// file-based route can be rendered standalone. `vi.hoisted` is required
// because `vi.mock` factories are hoisted above plain `const` declarations.
const { useParamsMock, useConnectorMock, useConnectorActivityMock, useConnectorsMock } = vi.hoisted(
  () => ({
    useParamsMock: vi.fn(() => ({ catalogId: 'linear', id: 'c1' })),
    useConnectorMock: vi.fn(),
    useConnectorActivityMock: vi.fn(),
    useConnectorsMock: vi.fn(),
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
  useConnectors: () => useConnectorsMock(),
}));

// Spec 2026-05-08 Task 21: the unified route also imports `useAppDetail` for
// the App-detection branch. Plain-instance tests don't exercise that branch,
// but the mock is still required so the module resolves at import time.
vi.mock('@/lib/use-app-detail', () => ({
  useAppDetail: () => ({ data: undefined, error: null, isLoading: false }),
}));

import { Route } from '@/routes/_authed/connectors.$catalogId.$id';

const Component = Route.options.component as () => JSX.Element;

const detailFixture = {
  kind: 'connector' as const,
  id: 'c1',
  slug: 'linear-acme',
  displayName: 'Linear',
  instanceLabel: 'Acme workspace',
  description: 'Linear MCP server.',
  source: 'catalog' as const,
  catalogId: 'linear',
  iconUrl: null,
  transport: 'remote' as const,
  status: 'enabled' as const,
  lastError: null,
  lastErrorAt: null,
  lastVerifiedAt: new Date(Date.now() - 60_000).toISOString(),
  toolCount: 12,
  invocationCount24h: 42,
  appId: null,
  command: null,
  args: null,
  url: 'https://mcp.linear.app/sse',
  secrets: [{ key: '__MCP_AUTHORIZATION__', masked: true as const, last4: 'a3f9' }],
  tools: [
    {
      toolName: 'get_issue',
      description: null,
      category: 'read' as const,
      permission: 'always_allow' as const,
    },
    {
      toolName: 'list_projects',
      description: null,
      category: 'read' as const,
      permission: 'always_allow' as const,
    },
    {
      toolName: 'create_issue',
      description: null,
      category: 'write' as const,
      permission: 'ask' as const,
    },
    {
      toolName: 'update_issue',
      description: null,
      category: 'write' as const,
      permission: 'ask' as const,
    },
    {
      toolName: 'delete_issue',
      description: null,
      category: 'write' as const,
      permission: 'never' as const,
    },
    {
      toolName: 'create_comment',
      description: null,
      category: 'interactive' as const,
      permission: 'ask' as const,
    },
  ],
};

describe('<ConnectorInstanceDetailScreen> (A5 plain instance detail)', () => {
  beforeEach(() => {
    useConnectorMock.mockReturnValue({
      data: detailFixture,
      error: null,
      isLoading: false,
    });
    useConnectorActivityMock.mockReturnValue({
      data: [],
      isLoading: false,
    });
    // List doesn't contain an app entry matching :id, so the branch falls
    // through to the plain-instance view.
    useConnectorsMock.mockReturnValue({ data: [], isLoading: false });
  });

  afterEach(() => {
    cleanup();
    useConnectorMock.mockReset();
    useConnectorActivityMock.mockReset();
    useConnectorsMock.mockReset();
  });

  it('renders the page title from instance_label', () => {
    render(<Component />);
    expect(screen.getByRole('heading', { level: 1, name: 'Acme workspace' })).toBeDefined();
  });

  it('renders the kicker with INSTANCE · LINEAR', () => {
    render(<Component />);
    expect(screen.getByText(/instance · linear/i)).toBeDefined();
  });

  it('renders the four header action buttons', () => {
    render(<Component />);
    expect(screen.getByRole('button', { name: /test/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /refresh tools/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /disable/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /uninstall/i })).toBeDefined();
  });

  it('renders the secrets row with masked value + REVEAL button', () => {
    render(<Component />);
    expect(screen.getByText('__MCP_AUTHORIZATION__')).toBeDefined();
    expect(screen.getByText(/••••••••••••a3f9/)).toBeDefined();
    expect(screen.getByRole('button', { name: /reveal/i })).toBeDefined();
  });

  it('renders at least one tool row with category + permission', () => {
    render(<Component />);
    expect(screen.getByText('get_issue')).toBeDefined();
    expect(screen.getAllByText('read').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/always allow/i).length).toBeGreaterThan(0);
  });

  it('falls back to displayName when instance_label is null', () => {
    useConnectorMock.mockReturnValue({
      data: { ...detailFixture, instanceLabel: null },
      error: null,
      isLoading: false,
    });
    render(<Component />);
    expect(screen.getByRole('heading', { level: 1, name: 'Linear' })).toBeDefined();
  });
});
