import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  useLocation: () => ({ pathname: '/' }),
}));

vi.mock('@/lib/use-health', () => ({
  useHealth: () => ({
    data: {
      status: 'ok',
      uptime: 173000,
      services: { backend: 'ticking', slack: 'ticking', runner: 'ticking' },
      lastTickAt: '2026-04-26T01:00:00Z',
    },
  }),
}));

import { DashboardSidebar } from '@/components/layout/dashboard-sidebar';

describe('<DashboardSidebar>', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders all 5 nav items in lowercase', () => {
    render(<DashboardSidebar />);
    expect(screen.getByText('home')).toBeDefined();
    expect(screen.getByText('crons')).toBeDefined();
    expect(screen.getByText('sessions')).toBeDefined();
    expect(screen.getByText('logs')).toBeDefined();
    expect(screen.getByText('settings')).toBeDefined();
  });

  it('omits a "connectors" nav item', () => {
    render(<DashboardSidebar />);
    expect(screen.queryByText('connectors')).toBeNull();
  });

  it('renders the user as "alex"', () => {
    render(<DashboardSidebar />);
    expect(screen.getByText('alex')).toBeDefined();
  });

  it('renders the runtime status panel with backend·claude-code and uptime', () => {
    render(<DashboardSidebar />);
    expect(screen.getByText('runtime')).toBeDefined();
    expect(screen.getByText('claude-code')).toBeDefined();
    // 173000s = 2d 0h 3m
    expect(screen.getByText(/uptime · 2d 00h 03m/)).toBeDefined();
  });
});
