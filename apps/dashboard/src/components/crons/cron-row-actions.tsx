import type { JSX, MouseEvent, ReactNode } from 'react';
import type { CronTableRow } from '@/components/crons/cron-row';
import { useDeleteCron, usePauseCron, useResumeCron, useRunNowCron } from '@/lib/mutations';

function stop(event: MouseEvent): void {
  event.preventDefault();
  event.stopPropagation();
}

/**
 * Inline action cluster shown at the right of each cron row. Visual reference:
 * `apps/design/src/routes/dashboard/crons/index.tsx` — `<Actions>`.
 *
 * This is the "live" variant that fires real mutations (pause/resume/run-now/
 * delete). The list page also passes a `requestDelete` callback when it wants
 * to surface a confirmation modal first; pass that via `onDelete`.
 */
export function CronRowActions({
  row,
  onDelete,
}: {
  row: CronTableRow;
  onDelete?: (row: CronTableRow) => void;
}): JSX.Element {
  const pause = usePauseCron();
  const resume = useResumeCron();
  const runNow = useRunNowCron();
  const deleteCron = useDeleteCron();

  const isPaused = row.status === 'paused';
  const running = row.running ?? false;

  return (
    <span className="inline-flex gap-1">
      <ActionButton
        disabled={running}
        onClick={(e) => {
          stop(e);
          if (!running) runNow.mutate(row.id);
        }}
      >
        {running ? '… running' : '▶ run'}
      </ActionButton>
      <ActionButton
        onClick={(e) => {
          stop(e);
          if (isPaused) resume.mutate(row.id);
          else pause.mutate(row.id);
        }}
      >
        {isPaused ? 'resume' : 'pause'}
      </ActionButton>
      <ActionButton
        danger
        onClick={(e) => {
          stop(e);
          if (onDelete) onDelete(row);
          else deleteCron.mutate(row.id);
        }}
      >
        del
      </ActionButton>
    </span>
  );
}

function ActionButton({
  children,
  danger,
  onClick,
  disabled = false,
}: {
  children: ReactNode;
  danger?: boolean;
  onClick: (e: MouseEvent) => void;
  disabled?: boolean;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`px-1.5 py-1 border border-border-subtle font-mono text-[9px] tracking-[0.06em] uppercase whitespace-nowrap transition-colors duration-[120ms] ${
        disabled
          ? 'text-gold border-gold-line bg-gold-soft cursor-default'
          : danger
            ? 'text-text-secondary hover:text-status-failed hover:border-status-failed/30 hover:bg-status-failed/[0.06] cursor-pointer'
            : 'text-text-secondary hover:text-gold hover:border-gold-line hover:bg-gold-soft cursor-pointer'
      }`}
    >
      {children}
    </button>
  );
}
