import type { JSX } from 'react';
import type { CronRunApi } from '@/lib/use-cron';

const statusColor: Record<CronRunApi['status'], string> = {
  running: 'bg-status-active',
  success: 'bg-status-active',
  failed: 'bg-status-failed',
  skipped: 'bg-text-tertiary',
};

function duration(run: CronRunApi): string {
  if (!run.finishedAt) return '…';
  const ms = new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime();
  return `${(ms / 1000).toFixed(1)}s`;
}

export function CronRunHistoryRow({ run }: { run: CronRunApi }): JSX.Element {
  return (
    <div className="flex items-center gap-4 border-b border-panel py-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center">
        <span className={`h-1.5 w-1.5 rounded-full ${statusColor[run.status]}`} />
      </span>
      <span className="w-40 shrink-0 font-mono text-xs text-text-tertiary">{run.startedAt}</span>
      <span className="w-16 shrink-0 text-sm text-text-secondary">{duration(run)}</span>
      <span className="flex-1 truncate text-sm text-text-primary">
        {run.status === 'failed' ? run.error : (run.output ?? '(no output)')}
      </span>
    </div>
  );
}
