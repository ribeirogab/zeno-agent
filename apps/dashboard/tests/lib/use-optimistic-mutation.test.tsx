import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const successMock = vi.fn();
const failMock = vi.fn();

vi.mock('@zeno/ui', () => ({
  useToast: () => ({
    success: successMock,
    fail: failMock,
    warn: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

import { useOptimisticMutation } from '@/lib/use-optimistic-mutation';

type Cron = { id: string; name: string; enabled: boolean };

function makeWrapper(qc: QueryClient): (props: { children: ReactNode }) => JSX.Element {
  return function Wrapper({ children }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

function seedCrons(qc: QueryClient, crons: Cron[]): void {
  qc.setQueryData<Cron[]>(['crons'], crons);
}

describe('useOptimisticMutation', () => {
  let qc: QueryClient;

  beforeEach(() => {
    vi.useFakeTimers();
    successMock.mockReset();
    failMock.mockReset();
    qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    qc.clear();
  });

  it('writes optimistic state, calls success toast, invalidates after delay', async () => {
    seedCrons(qc, [{ id: 'a', name: 'a', enabled: true }]);

    const { result } = renderHook(
      () =>
        useOptimisticMutation<string, void>({
          mutationFn: async () => undefined,
          optimisticUpdate: (id) => [
            {
              queryKey: ['crons'],
              updater: (prev) => {
                const crons = prev as Cron[] | undefined;
                return crons?.map((c) => (c.id === id ? { ...c, enabled: false } : c));
              },
            },
          ],
          invalidateKeys: () => [['crons']],
          successToast: 'paused',
        }),
      { wrapper: makeWrapper(qc) },
    );

    await act(async () => {
      await result.current.mutateAsync('a');
    });

    expect(qc.getQueryData<Cron[]>(['crons'])?.[0].enabled).toBe(false);
    expect(successMock).toHaveBeenCalledWith('paused');
    expect(failMock).not.toHaveBeenCalled();
  });

  it('restores the snapshot and fires error toast when mutation rejects', async () => {
    seedCrons(qc, [{ id: 'a', name: 'a', enabled: true }]);

    const { result } = renderHook(
      () =>
        useOptimisticMutation<string, void>({
          mutationFn: async () => {
            throw new Error('boom');
          },
          optimisticUpdate: (id) => [
            {
              queryKey: ['crons'],
              updater: (prev) => {
                const crons = prev as Cron[] | undefined;
                return crons?.map((c) => (c.id === id ? { ...c, enabled: false } : c));
              },
            },
          ],
          invalidateKeys: () => [['crons']],
        }),
      { wrapper: makeWrapper(qc) },
    );

    await act(async () => {
      await expect(result.current.mutateAsync('a')).rejects.toThrow('boom');
    });

    expect(qc.getQueryData<Cron[]>(['crons'])?.[0].enabled).toBe(true);
    expect(failMock).toHaveBeenCalled();
  });

  it('snapshots and restores multiple caches atomically', async () => {
    qc.setQueryData(['crons'], [{ id: 'a', name: 'a', enabled: true }]);
    qc.setQueryData(['crons', 'a'], {
      cron: { id: 'a', name: 'a', enabled: true },
      recentRuns: [],
    });

    const { result } = renderHook(
      () =>
        useOptimisticMutation<string, void>({
          mutationFn: async () => {
            throw new Error('boom');
          },
          optimisticUpdate: (id) => [
            {
              queryKey: ['crons'],
              updater: (prev) => {
                const crons = prev as Cron[] | undefined;
                return crons?.map((c) => (c.id === id ? { ...c, enabled: false } : c));
              },
            },
            {
              queryKey: ['crons', id],
              updater: (prev) => {
                const detail = prev as { cron: Cron; recentRuns: unknown[] } | undefined;
                return detail ? { ...detail, cron: { ...detail.cron, enabled: false } } : detail;
              },
            },
          ],
          invalidateKeys: () => [['crons'], ['crons', 'a']],
        }),
      { wrapper: makeWrapper(qc) },
    );

    await act(async () => {
      await expect(result.current.mutateAsync('a')).rejects.toThrow();
    });

    expect(qc.getQueryData<Cron[]>(['crons'])?.[0].enabled).toBe(true);
    expect(qc.getQueryData<{ cron: Cron }>(['crons', 'a'])?.cron.enabled).toBe(true);
  });

  it('degrades to plain mutation when optimisticUpdate is omitted', async () => {
    const { result } = renderHook(
      () =>
        useOptimisticMutation<void, number>({
          mutationFn: async () => 42,
          successToast: (n) => `got ${n}`,
        }),
      { wrapper: makeWrapper(qc) },
    );

    await act(async () => {
      const v = await result.current.mutateAsync();
      expect(v).toBe(42);
    });

    expect(successMock).toHaveBeenCalledWith('got 42');
  });

  it('invalidateSoon fires after the delay', async () => {
    seedCrons(qc, [{ id: 'a', name: 'a', enabled: true }]);
    const spy = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(
      () =>
        useOptimisticMutation<string, void>({
          mutationFn: async () => undefined,
          invalidateKeys: () => [['crons']],
          invalidateDelayMs: 500,
        }),
      { wrapper: makeWrapper(qc) },
    );

    await act(async () => {
      await result.current.mutateAsync('a');
    });

    expect(spy).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['crons'] });
  });
});
