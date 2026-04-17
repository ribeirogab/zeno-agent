import {
  type QueryClient,
  type QueryKey,
  type UseMutationResult,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { formatError } from '@/lib/format-error';
import { invalidateSoon } from '@/lib/invalidate-soon';

export interface OptimisticCacheChange<TData = unknown> {
  queryKey: QueryKey;
  updater: (prev: TData | undefined) => TData | undefined;
}

export interface OptimisticMutationOptions<TVars, TResult> {
  mutationFn: (vars: TVars) => Promise<TResult>;
  /** Declarative cache writes applied on click. Return `[]` to skip optimism. */
  optimisticUpdate?: (vars: TVars, queryClient: QueryClient) => OptimisticCacheChange[];
  /** Query keys to invalidate after the API responds. Fires via `invalidateSoon`. */
  invalidateKeys?: (vars: TVars, result: TResult | undefined) => QueryKey[];
  /** Delay for `invalidateSoon`. Default 1500ms (matches worker poll tick + buffer). */
  invalidateDelayMs?: number;
  /** Toast on 2xx. Static string or function of result+vars. Omit for silent success. */
  successToast?: string | ((result: TResult, vars: TVars) => string);
  /** Toast on error. Defaults to `formatError(err)`. */
  errorToast?: string | ((err: unknown, vars: TVars) => string);
}

interface Snapshot {
  queryKey: QueryKey;
  value: unknown;
}

interface MutationContext {
  snapshots: Snapshot[];
}

/**
 * The project-wide pattern for dashboard mutations with a cache effect.
 *
 * Handles: query cancellation, snapshot-and-restore on error, optimistic write,
 * `invalidateSoon` from `onSettled`, and success/error toasts. Each mutation
 * becomes a declarative config instead of ~35 lines of TanStack plumbing.
 *
 * See `context/conventions/code-style.md` and `context/learnings/optimistic-mutation-pattern.md`.
 */
export function useOptimisticMutation<TVars, TResult = void>(
  opts: OptimisticMutationOptions<TVars, TResult>,
): UseMutationResult<TResult, unknown, TVars, MutationContext> {
  const qc = useQueryClient();

  return useMutation<TResult, unknown, TVars, MutationContext>({
    mutationFn: opts.mutationFn,

    onMutate: async (vars) => {
      const changes = opts.optimisticUpdate?.(vars, qc) ?? [];
      const snapshots: Snapshot[] = [];

      for (const change of changes) {
        await qc.cancelQueries({ queryKey: change.queryKey });
        const prev = qc.getQueryData(change.queryKey);
        snapshots.push({ queryKey: change.queryKey, value: prev });
        qc.setQueryData(change.queryKey, change.updater(prev));
      }

      return { snapshots };
    },

    onError: (err, vars, ctx) => {
      if (ctx) {
        for (const snap of ctx.snapshots) {
          qc.setQueryData(snap.queryKey, snap.value);
        }
      }
      const msg =
        typeof opts.errorToast === 'function'
          ? opts.errorToast(err, vars)
          : (opts.errorToast ?? formatError(err));
      toast.error(msg);
    },

    onSuccess: (result, vars) => {
      if (opts.successToast !== undefined) {
        const msg =
          typeof opts.successToast === 'function'
            ? opts.successToast(result, vars)
            : opts.successToast;
        toast.success(msg);
      }
    },

    onSettled: (result, _err, vars) => {
      const keys = opts.invalidateKeys?.(vars, result) ?? [];
      if (keys.length > 0) {
        invalidateSoon(qc, keys, opts.invalidateDelayMs);
      }
    },
  });
}
