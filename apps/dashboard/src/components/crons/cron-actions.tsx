import { useNavigate } from '@tanstack/react-router';
import type { JSX } from 'react';
import { useDeleteCron, usePauseCron, useResumeCron, useRunNowCron } from '@/lib/mutations';
import type { CronApi } from '@/lib/use-crons';

/**
 * Detail-page action cluster (pause / run now / delete). Visual reference:
 * `apps/design/src/routes/dashboard/crons/detail/index.tsx` — `<ActionButtons>`.
 */
export function CronActions({
  cron,
  onRequestDelete,
}: {
  cron: CronApi;
  /** When provided, called instead of firing delete directly — for surfacing a confirmation modal. */
  onRequestDelete?: (cron: CronApi) => void;
}): JSX.Element {
  const pause = usePauseCron();
  const resume = useResumeCron();
  const runNow = useRunNowCron();
  const deleteCron = useDeleteCron();
  const navigate = useNavigate();

  const handlePauseToggle = (): void => {
    if (cron.enabled) pause.mutate(cron.id);
    else resume.mutate(cron.id);
  };
  const handleRunNow = (): void => {
    runNow.mutate(cron.id);
  };
  const handleDelete = (): void => {
    if (onRequestDelete) onRequestDelete(cron);
    else
      deleteCron.mutate(cron.id, {
        onSuccess: () => void navigate({ to: '/crons' }),
      });
  };

  return (
    <div className="flex shrink-0 self-end gap-2">
      <button
        type="button"
        onClick={handlePauseToggle}
        disabled={cron.enabled ? pause.isPending : resume.isPending}
        className="inline-flex items-center gap-2 px-3.5 py-2 border border-transparent font-mono text-xs font-medium tracking-[0.06em] leading-4 uppercase text-text-secondary hover:text-text-primary transition-colors duration-[120ms] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {cron.enabled ? 'pause' : 'resume'}
      </button>
      <button
        type="button"
        onClick={handleRunNow}
        disabled={runNow.isPending || !cron.enabled}
        className="inline-flex items-center gap-2 px-3.5 py-2 bg-gold border border-gold font-mono text-xs font-semibold tracking-[0.06em] leading-4 uppercase text-text-ink hover:bg-gold-bright hover:border-gold-bright transition-colors duration-[120ms] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <PlayIcon />
        run now
      </button>
      {cron.source === 'chat' ? (
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleteCron.isPending}
          className="inline-flex items-center px-3.5 py-2 border border-status-failed/40 font-mono text-xs font-semibold tracking-[0.06em] leading-4 uppercase text-status-failed hover:bg-status-failed/[0.08] transition-colors duration-[120ms] disabled:cursor-not-allowed disabled:opacity-60"
        >
          delete
        </button>
      ) : null}
    </div>
  );
}

function PlayIcon(): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <polygon points="6 4 20 12 6 20 6 4" />
    </svg>
  );
}
