/**
 * Spec 0072 — legacy redirect from the old /onboarding/connect-claude path
 * to the new backend-generic /onboarding/connect-backend. Catches any
 * cached browser bookmarks / external links from before the rename.
 */

import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/onboarding/connect-claude')({
  beforeLoad: () => {
    throw redirect({ to: '/onboarding/connect-backend' });
  },
});
