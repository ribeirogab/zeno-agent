import type { QueryClient, QueryKey } from '@tanstack/react-query';

/**
 * After a fire-and-forget mutation, invalidate the listed query keys after a
 * short delay so the worker has time to process the command. 1500ms is the
 * default (1s poll tick + 500ms handler buffer).
 */
export function invalidateSoon(queryClient: QueryClient, keys: QueryKey[], delayMs = 1500): void {
  setTimeout(() => {
    for (const key of keys) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  }, delayMs);
}
