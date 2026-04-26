import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import type { JSX } from 'react';
import { DashboardCommandPalette } from '@/components/layout/dashboard-command-palette';
import { DashboardSidebar } from '@/components/layout/dashboard-sidebar';
import { ApiError, apiFetch } from '@/lib/api-client';

export const Route = createFileRoute('/_authed')({
  beforeLoad: async () => {
    try {
      await apiFetch<void>('/api/auth/me');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        throw redirect({ to: '/login' });
      }
      throw err;
    }
  },
  component: AuthedLayout,
});

function AuthedLayout(): JSX.Element {
  return (
    <div className="flex min-h-screen bg-canvas">
      <DashboardSidebar />
      <main className="flex-1 flex flex-col overflow-auto">
        <Outlet />
      </main>
      <DashboardCommandPalette />
    </div>
  );
}
