/**
 * Live preview of a rule pattern's match count. Spec 0047.
 *
 * Backend POSTs the pattern + iterates the connector tool inventory.
 * Debounced via TanStack Query's natural staleTime; the modal layer is
 * responsible for not over-firing (e.g., debounce in onChange before calling
 * .mutateAsync).
 */

import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export interface PreviewResponse {
  matchCount: number;
  samples: string[];
  totalInventory: number;
}

export function useRuleMatchPreview() {
  return useMutation<PreviewResponse, unknown, string>({
    mutationFn: (pattern) =>
      apiFetch<PreviewResponse>('/api/approval-rules/preview', {
        method: 'POST',
        body: JSON.stringify({ pattern }),
      }),
  });
}
