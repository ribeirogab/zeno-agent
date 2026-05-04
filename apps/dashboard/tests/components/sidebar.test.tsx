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

const useSettingsMock = vi.fn();
vi.mock('@/lib/use-settings', () => ({
  useSettings: () => useSettingsMock(),
}));

// Spec 0071: sidebar reads backend status from useBackends to drive the
// status dot colour. Mock returns no data → dot falls back to neutral grey.
vi.mock('@/lib/use-backends', () => ({
  useBackends: () => ({ data: undefined }),
}));

import { DashboardSidebar, deriveInitials } from '@/components/layout/dashboard-sidebar';

function settingsResult(profile: { name: string | null; slug: string } | null) {
  if (!profile) return { data: undefined };
  return {
    data: {
      backend: { name: 'claude-code', selectedVia: 'env' },
      profile,
      profileFiles: [],
    },
  };
}

describe('<DashboardSidebar>', () => {
  afterEach(() => {
    cleanup();
    useSettingsMock.mockReset();
  });

  it('renders 6 nav items in lowercase (spec 0066 B: no sessions, no logs)', () => {
    useSettingsMock.mockReturnValue(settingsResult({ name: 'Operator', slug: 'fn' }));
    render(<DashboardSidebar />);
    expect(screen.getByText('home')).toBeDefined();
    expect(screen.getByText('crons')).toBeDefined();
    expect(screen.getByText('channels')).toBeDefined();
    expect(screen.getByText('connectors')).toBeDefined();
    expect(screen.getByText('skills')).toBeDefined();
    expect(screen.getByText('settings')).toBeDefined();
  });

  it('does not render "sessions" or "logs" nav items (spec 0066 B + follow-up)', () => {
    useSettingsMock.mockReturnValue(settingsResult({ name: 'Operator', slug: 'fn' }));
    render(<DashboardSidebar />);
    expect(screen.queryByText('sessions')).toBeNull();
    expect(screen.queryByText('logs')).toBeNull();
  });

  it('renders the user row from USER.md name + slug (spec 0066 A)', () => {
    useSettingsMock.mockReturnValue(settingsResult({ name: 'Operator', slug: 'fn' }));
    render(<DashboardSidebar />);
    expect(screen.getByText('Operator')).toBeDefined();
    expect(screen.getByText('fn · profile')).toBeDefined();
    expect(screen.getByText('GA')).toBeDefined();
  });

  it('falls back to slug when USER.md has no name (spec 0066 A)', () => {
    useSettingsMock.mockReturnValue(settingsResult({ name: null, slug: 'default' }));
    render(<DashboardSidebar />);
    expect(screen.getByText('default')).toBeDefined();
    expect(screen.getByText('default · profile')).toBeDefined();
    expect(screen.getByText('DE')).toBeDefined();
  });

  it('renders placeholders while settings is loading', () => {
    useSettingsMock.mockReturnValue(settingsResult(null));
    render(<DashboardSidebar />);
    expect(screen.getByText('…')).toBeDefined();
    expect(screen.getByText('··')).toBeDefined();
  });

  it('renders the runtime status panel with backend·claude-code and uptime', () => {
    useSettingsMock.mockReturnValue(settingsResult({ name: 'Operator', slug: 'fn' }));
    render(<DashboardSidebar />);
    expect(screen.getByText('runtime')).toBeDefined();
    expect(screen.getByText('claude-code')).toBeDefined();
    // 173000s = 2d 0h 3m
    expect(screen.getByText(/uptime · 2d 00h 03m/)).toBeDefined();
  });
});

describe('deriveInitials (spec 0066 A)', () => {
  it('first+last char for multi-word names', () => {
    expect(deriveInitials('Maria José', 'fn')).toBe('MJ');
    expect(deriveInitials('John Doe', 'fn')).toBe('JD');
    expect(deriveInitials('Ana Lúcia Silva', 'fn')).toBe('AS');
  });

  it('first 2 chars for single-word names', () => {
    expect(deriveInitials('Operator', 'fn')).toBe('GA');
    expect(deriveInitials('alex', 'default')).toBe('AL');
  });

  it('falls back to slug when name is null/empty', () => {
    expect(deriveInitials(null, 'default')).toBe('DE');
    expect(deriveInitials('', 'fn')).toBe('FN');
    expect(deriveInitials('   ', 'fn')).toBe('FN');
  });

  it('handles single-char names by padding via slug-style slice', () => {
    expect(deriveInitials('X', 'fn')).toBe('X');
  });
});
