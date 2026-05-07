import { createFileRoute, Outlet } from '@tanstack/react-router';
import type { JSX } from 'react';
import { DashboardCommandPalette } from '@/components/layout/dashboard-command-palette';
import { DashboardSidebar } from '@/components/layout/dashboard-sidebar';

// dashboard-cleanup spec: auth removed (single-user, bind 127.0.0.1, CSRF guard
// on mutating routes only). The `_authed` prefix is preserved for now so the
// existing route tree under _authed/ continues to render through this layout
// without a churn-heavy rename. The directory name no longer implies a guard.
export const Route = createFileRoute('/_authed')({
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
