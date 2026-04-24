import type { JSX, MouseEvent } from 'react';
import { useDeleteCron, usePauseCron, useResumeCron, useRunNowCron } from '@/lib/mutations';
import type { CronApi } from '@/lib/use-crons';

function stop(event: MouseEvent): void {
  event.preventDefault();
  event.stopPropagation();
}

const actionBase =
  'font-mono text-[11px] tracking-[0.04em] text-text-tertiary hover:text-text-primary transition-colors';
const actionDanger =
  'font-mono text-[11px] tracking-[0.04em] text-text-tertiary hover:text-status-failed transition-colors';

export function CronRowActions({ cron }: { cron: CronApi }): JSX.Element {
  const pause = usePauseCron();
  const resume = useResumeCron();
  const runNow = useRunNowCron();
  const deleteCron = useDeleteCron();

  return (
    <span className="flex items-center gap-3">
      <button
        type="button"
        className={actionBase}
        onClick={(event) => {
          stop(event);
          runNow.mutate(cron.id);
        }}
      >
        ▶ run
      </button>
      <button
        type="button"
        className={actionBase}
        onClick={(event) => {
          stop(event);
          if (cron.enabled) {
            pause.mutate(cron.id);
          } else {
            resume.mutate(cron.id);
          }
        }}
      >
        {cron.enabled ? 'pause' : 'resume'}
      </button>
      {cron.source === 'chat' && (
        <button
          type="button"
          className={actionDanger}
          onClick={(event) => {
            stop(event);
            deleteCron.mutate(cron.id);
          }}
        >
          del
        </button>
      )}
    </span>
  );
}
