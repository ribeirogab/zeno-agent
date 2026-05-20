import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@zeno/ui';
import { apiFetch } from '@/lib/api-client';
import { formatError } from '@/lib/format-error';
import { tempId } from '@/lib/temp-id';
import type { CronRunApi } from '@/lib/use-cron';
import type { CronApi } from '@/lib/use-crons';
import {
  cacheChange,
  type OptimisticCacheChange,
  useOptimisticMutation,
} from '@/lib/use-optimistic-mutation';

type CronDetailCache = { cron: CronApi; recentRuns: CronRunApi[] };

function setEnabledInList(id: string, enabled: boolean): OptimisticCacheChange {
  return cacheChange<CronApi[]>(['crons'], (prev) =>
    prev?.map((c) => (c.id === id ? { ...c, enabled } : c)),
  );
}

function setEnabledInDetail(id: string, enabled: boolean): OptimisticCacheChange {
  return cacheChange<CronDetailCache>(['crons', id], (prev) =>
    prev ? { ...prev, cron: { ...prev.cron, enabled } } : prev,
  );
}

export function usePauseCron() {
  return useOptimisticMutation<string, void>({
    mutationFn: (id) => apiFetch<void>(`/api/crons/${id}/pause`, { method: 'POST' }),
    optimisticUpdate: (id) => [setEnabledInList(id, false), setEnabledInDetail(id, false)],
    invalidateKeys: (id) => [['crons'], ['crons', id]],
    successToast: 'cron paused',
  });
}

export function useResumeCron() {
  return useOptimisticMutation<string, void>({
    mutationFn: (id) => apiFetch<void>(`/api/crons/${id}/resume`, { method: 'POST' }),
    optimisticUpdate: (id) => [setEnabledInList(id, true), setEnabledInDetail(id, true)],
    invalidateKeys: (id) => [['crons'], ['crons', id]],
    successToast: 'cron resumed',
  });
}

export function useDeleteCron() {
  return useOptimisticMutation<string, void>({
    mutationFn: (id) => apiFetch<void>(`/api/crons/${id}`, { method: 'DELETE' }),
    optimisticUpdate: (id) => [
      cacheChange<CronApi[]>(['crons'], (prev) => prev?.filter((c) => c.id !== id)),
    ],
    invalidateKeys: () => [['crons']],
    successToast: 'cron deleted',
  });
}

export function useRunNowCron() {
  return useOptimisticMutation<string, void>({
    mutationFn: (id) => apiFetch<void>(`/api/crons/${id}/run-now`, { method: 'POST' }),
    optimisticUpdate: (id) => [
      cacheChange<CronDetailCache>(['crons', id], (prev) => {
        if (!prev) return prev;
        const provisional: CronRunApi = {
          id: tempId('run'),
          cronId: id,
          startedAt: new Date().toISOString(),
          finishedAt: null,
          status: 'running',
          output: null,
          error: null,
        };
        return { ...prev, recentRuns: [provisional, ...prev.recentRuns] };
      }),
    ],
    invalidateKeys: (id) => [['crons', id]],
    invalidateDelayMs: 5000,
    successToast: 'run started',
  });
}

export interface CreateCronInput {
  name: string;
  description?: string;
  prompt: string;
  schedule: string;
  notifyConversationId?: string | null;
  notifyThreadId?: string | null;
}

export function useCreateCron() {
  return useOptimisticMutation<CreateCronInput, void>({
    mutationFn: (input) =>
      apiFetch<void>('/api/crons', { method: 'POST', body: JSON.stringify(input) }),
    optimisticUpdate: (input) => [
      cacheChange<CronApi[]>(['crons'], (prev) => {
        const nowIso = new Date().toISOString();
        const provisional: CronApi = {
          id: tempId('cron'),
          name: input.name,
          description: input.description ?? null,
          prompt: input.prompt,
          schedule: input.schedule,
          enabled: true,
          source: 'chat',
          createdBy: 'dashboard',
          notifyConversationId: input.notifyConversationId ?? null,
          notifyThreadId: input.notifyThreadId ?? null,
          createdAt: nowIso,
          updatedAt: nowIso,
          lastRunAt: null,
          nextRunAt: null,
        };
        return [provisional, ...(prev ?? [])];
      }),
    ],
    invalidateKeys: () => [['crons']],
    successToast: 'cron created',
  });
}

// Spec 2026-05-20 (agents-md-per-instance): write AGENTS.md from the
// inline editor on the profile settings tab. Plain useMutation (no
// optimistic primitive) — the chokidar watcher in the worker reloads
// the system prompt on the rename event, and `settings` query
// invalidation refreshes the last-modified timestamp shown in the
// editor header.
export interface UpdateAgentsMdResponse {
  path: string;
  bytes: number;
  mtime: string;
  content: string;
}

export function useUpdateAgentsMd() {
  const toast = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (content: string) =>
      apiFetch<UpdateAgentsMdResponse>('/api/settings/profile-files/AGENTS.md', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['settings', 'agents-md'] });
      toast.success('AGENTS.md saved · agent reloads next turn');
    },
    onError: (err) => toast.fail(formatError(err)),
  });
}
