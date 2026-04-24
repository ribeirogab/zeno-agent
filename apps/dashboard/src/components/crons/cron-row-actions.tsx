import type { JSX, MouseEvent } from 'react';
import { useDeleteCron, usePauseCron, useResumeCron, useRunNowCron } from '@/lib/mutations';
import type { CronApi } from '@/lib/use-crons';

function stop(event: MouseEvent): void {
  event.preventDefault();
  event.stopPropagation();
}

const actionBase =
  'border border-border-subtle bg-transparent px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-text-secondary transition-all duration-[120ms] hover:border-gold-line hover:bg-gold-soft hover:text-gold';
const actionDanger =
  'border border-border-subtle bg-transparent px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-text-secondary transition-all duration-[120ms] hover:border-status-failed/30 hover:bg-status-failed/[0.06] hover:text-status-failed';

export function CronRowActions({ cron }: { cron: CronApi }): JSX.Element {
  const pause = usePauseCron();
  const resume = useResumeCron();
  const runNow = useRunNowCron();
  const deleteCron = useDeleteCron();

  return (
    <span className="inline-flex gap-1 opacity-0 transition-opacity duration-[120ms] group-hover:opacity-100">
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
