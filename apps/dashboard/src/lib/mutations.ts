import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, apiFetch } from '@/lib/api-client';
import { invalidateSoon } from '@/lib/invalidate-soon';

function formatError(err: unknown): string {
  if (err instanceof ApiError) {
    if (typeof err.body === 'object' && err.body && 'error' in err.body) {
      const e = (err.body as { error: unknown }).error;
      if (typeof e === 'string') return e;
    }
    return `erro ${err.status}`;
  }
  return err instanceof Error ? err.message : 'erro desconhecido';
}

export function usePauseCron() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/crons/${id}/pause`, { method: 'POST' }),
    onSuccess: (_r, id) => {
      toast.success('cron pausado');
      invalidateSoon(qc, [['crons'], ['crons', id]]);
    },
    onError: (err) => toast.error(formatError(err)),
  });
}

export function useResumeCron() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/crons/${id}/resume`, { method: 'POST' }),
    onSuccess: (_r, id) => {
      toast.success('cron retomado');
      invalidateSoon(qc, [['crons'], ['crons', id]]);
    },
    onError: (err) => toast.error(formatError(err)),
  });
}

export function useRunNowCron() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/crons/${id}/run-now`, { method: 'POST' }),
    onSuccess: (_r, id) => {
      toast.success('execução iniciada');
      invalidateSoon(qc, [['crons', id]], 5000);
    },
    onError: (err) => toast.error(formatError(err)),
  });
}

export function useDeleteCron() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/crons/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('cron removido');
      invalidateSoon(qc, [['crons']]);
    },
    onError: (err) => toast.error(formatError(err)),
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
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCronInput) =>
      apiFetch<void>('/api/crons', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      toast.success('cron criado');
      invalidateSoon(qc, [['crons']]);
    },
    onError: (err) => toast.error(formatError(err)),
  });
}

export function useRestartWorker() {
  return useMutation({
    mutationFn: () => apiFetch<void>('/api/settings/restart', { method: 'POST' }),
    onSuccess: () => toast.success('reiniciando worker…'),
    onError: (err) => toast.error(formatError(err)),
  });
}
