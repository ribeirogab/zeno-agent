/**
 * Uninstall-App mutation hook. Spec 0046 M12.
 *
 * Backend endpoint: POST /api/connectors/catalog/github-app/uninstall-app
 *   body: {confirmAppName}
 *
 * The backend deletes the connector_apps row; ON DELETE CASCADE removes every
 * github-app-* connector + their secrets in one transaction. The worker
 * tear-down runs asynchronously via the `app_uninstall` command handler.
 *
 * Uses `useOptimisticMutation` factory. Optimistic update drops the App row
 * from the connectors listing cache. Caller is expected to navigate away
 * from /connectors/github-app on success.
 */

import { apiFetch } from '@/lib/api-client';
import type { ConnectorListEntry } from '@/lib/use-connectors';
import { cacheChange, useOptimisticMutation } from '@/lib/use-optimistic-mutation';

export interface UninstallAppInput {
  confirmAppName: string;
}

export interface UninstallAppResponse {
  /**
   * Spec 2026-05-08-connectors-cli-first-design Task 10: mutating endpoints
   * now return 202 + correlationId so the CLI can poll. Dashboard hooks ignore
   * this field for now (the worker tear-down still runs asynchronously); kept
   * here so consumers can adopt the polling pattern later.
   */
  correlationId: string;
}

export function useUninstallApp(appUuid: string | undefined) {
  return useOptimisticMutation<UninstallAppInput, UninstallAppResponse>({
    mutationFn: (input) =>
      apiFetch<UninstallAppResponse>('/api/connectors/catalog/github-app/uninstall-app', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    optimisticUpdate: () => [
      cacheChange<ConnectorListEntry[]>(['connectors'], (prev) => {
        if (!prev) return prev;
        return prev.filter((e) => !(e.kind === 'app' && e.appUuid === appUuid));
      }),
    ],
    invalidateKeys: () => [['connectors']],
    successToast: (_, vars) => `${vars.confirmAppName} uninstalled`,
  });
}
