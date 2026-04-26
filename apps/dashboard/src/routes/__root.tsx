import { QueryClientProvider } from '@tanstack/react-query';
import { createRootRoute, Outlet } from '@tanstack/react-router';
import { ToastProvider } from '@zeno/ui';
import { queryClient } from '@/lib/query-client';

export const Route = createRootRoute({
  component: () => (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <Outlet />
      </ToastProvider>
    </QueryClientProvider>
  ),
});
