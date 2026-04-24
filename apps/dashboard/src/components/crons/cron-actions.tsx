import { useNavigate } from '@tanstack/react-router';
import { Button } from '@zeno/ui';
import type { JSX } from 'react';
import { IcoPlay } from '@/components/icons';
import { useDeleteCron, usePauseCron, useResumeCron, useRunNowCron } from '@/lib/mutations';
import type { CronApi } from '@/lib/use-crons';

export function CronActions({ cron }: { cron: CronApi }): JSX.Element {
  const pause = usePauseCron();
  const resume = useResumeCron();
  const runNow = useRunNowCron();
  const deleteCron = useDeleteCron();
  const navigate = useNavigate();

  return (
    <div className="flex shrink-0 items-center gap-2">
      <Button
        variant="ghost"
        disabled={cron.enabled ? pause.isPending : resume.isPending}
        onClick={() => {
          if (cron.enabled) {
            pause.mutate(cron.id);
          } else {
            resume.mutate(cron.id);
          }
        }}
      >
        {cron.enabled ? 'pause' : 'resume'}
      </Button>
      <Button
        variant="primary"
        disabled={runNow.isPending || !cron.enabled}
        onClick={() => runNow.mutate(cron.id)}
      >
        <IcoPlay size={12} />
        run now
      </Button>
      {cron.source === 'chat' && (
        <Button
          variant="danger"
          size="sm"
          disabled={deleteCron.isPending}
          onClick={() =>
            deleteCron.mutate(cron.id, {
              onSuccess: () => void navigate({ to: '/crons' }),
            })
          }
        >
          delete
        </Button>
      )}
    </div>
  );
}
