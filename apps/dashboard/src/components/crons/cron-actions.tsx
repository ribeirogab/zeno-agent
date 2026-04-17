import { useNavigate } from '@tanstack/react-router';
import { Button } from '@zeno/ui';
import type { JSX } from 'react';
import { useDeleteCron, usePauseCron, useResumeCron, useRunNowCron } from '@/lib/mutations';
import type { CronApi } from '@/lib/use-crons';

export function CronActions({ cron }: { cron: CronApi }): JSX.Element {
  const pause = usePauseCron();
  const resume = useResumeCron();
  const runNow = useRunNowCron();
  const deleteCron = useDeleteCron();
  const navigate = useNavigate();

  const onDelete = (): void => {
    const confirmed = window.confirm(
      `remover cron "${cron.name}"? essa ação não pode ser desfeita.`,
    );
    if (!confirmed) return;
    deleteCron.mutate(cron.id, {
      onSuccess: () => {
        void navigate({ to: '/crons' });
      },
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="accent"
        size="sm"
        disabled={runNow.isPending || !cron.enabled}
        onClick={() => runNow.mutate(cron.id)}
      >
        ▶ Run now
      </Button>
      {cron.enabled ? (
        <Button
          variant="outline"
          size="sm"
          disabled={pause.isPending}
          onClick={() => pause.mutate(cron.id)}
        >
          Pause
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          disabled={resume.isPending}
          onClick={() => resume.mutate(cron.id)}
        >
          Resume
        </Button>
      )}
      {cron.source === 'chat' && (
        <Button variant="ghost" size="sm" disabled={deleteCron.isPending} onClick={onDelete}>
          Delete
        </Button>
      )}
    </div>
  );
}
