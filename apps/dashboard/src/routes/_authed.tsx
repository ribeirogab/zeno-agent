import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
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
  component: () => <Outlet />,
});
