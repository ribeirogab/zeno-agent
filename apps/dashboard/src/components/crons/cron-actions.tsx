import { useNavigate } from '@tanstack/react-router';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
} from '@zeno/ui';
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
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" disabled={deleteCron.isPending}>
              Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>delete this cron?</AlertDialogTitle>
              <AlertDialogDescription>
                {`"${cron.name}" will be deleted. This action cannot be undone.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel asChild>
                <Button variant="ghost">cancel</Button>
              </AlertDialogCancel>
              <AlertDialogAction asChild>
                <Button variant="accent" onClick={onDelete}>
                  delete
                </Button>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
