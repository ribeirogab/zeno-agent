import '@testing-library/jest-dom/vitest';
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
      uptime: 123,
      services: { backend: 'unknown', slack: 'unknown', runner: 'ticking' },
      lastTickAt: '2026-04-16T01:00:00Z',
    },
  }),
}));

import { Sidebar } from '@/components/layout/Sidebar';

describe('Sidebar', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders all nav labels', () => {
    render(<Sidebar />);
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Crons')).toBeInTheDocument();
    expect(screen.getByText('Sessions')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Logs')).toBeInTheDocument();
  });

  it('renders the status block with the runner label', () => {
    render(<Sidebar />);
    expect(screen.getByText(/runner · ticking/)).toBeInTheDocument();
  });
});
