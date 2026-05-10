/**
 * Spec 0072 — legacy redirect from the old /settings/backend path to the new
 * top-level /backend page. Catches any cached browser bookmarks / external
 * links from before the BACKEND tab was promoted out of /settings.
 */

import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/settings/backend')({
  beforeLoad: () => {
    throw redirect({ to: '/backend' });
  },
});
