import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@zeno/ui';
import { apiFetch } from '@/lib/api-client';
import { formatError } from '@/lib/format-error';

// Spec 2026-05-22 (crons CLI-first): cron mutation hooks (usePauseCron,
// useResumeCron, useDeleteCron, useRunNowCron, useCreateCron) were removed.
// Crons are now filesystem-managed; the dashboard `/crons` page is read-only
// and surfaces equivalent `zeno cron …` commands via <CommandModal>.

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
