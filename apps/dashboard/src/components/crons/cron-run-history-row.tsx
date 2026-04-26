import { type JSX, useState } from 'react';
import { isTempId } from '@/lib/temp-id';
import type { CronRunApi } from '@/lib/use-cron';

function duration(run: CronRunApi): string {
  if (!run.finishedAt) return '…';
  const ms = new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime();
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * One row in the cron run-history list with click-to-expand JSON output.
 * Visual reference: `apps/design/src/routes/dashboard/crons/detail/index.tsx`
 * — `<RunRow>`.
 */
export function CronRunHistoryRow({ run }: { run: CronRunApi }): JSX.Element {
  const pending = isTempId(run.id);
  const [expanded, setExpanded] = useState(false);
  const isFailed = run.status === 'failed';
  const output = isFailed ? run.error : run.output;
  const dotColor = isFailed ? 'bg-status-failed' : 'bg-status-active';
  const durationColor = isFailed ? 'text-status-failed' : 'text-gold';
  const summaryColor = isFailed ? 'text-status-failed' : 'text-text-primary';
  const actionColor = expanded ? 'text-gold' : 'text-text-tertiary';

  return (
    <>
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className={`flex items-center gap-4 px-5 py-2.5 cursor-pointer hover:bg-panel-2 transition-colors duration-[120ms] w-full text-left bg-transparent border-0 ${pending ? 'opacity-60' : ''}`}
      >
        <span className="shrink-0 w-1.5 flex justify-center">
          <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
        </span>
        <span className="shrink-0 w-[170px] font-mono text-xs leading-4 text-text-secondary">
          {formatTimestamp(run.startedAt)}
        </span>
        <span className={`shrink-0 w-[60px] font-mono text-xs leading-4 ${durationColor}`}>
          {duration(run)}
        </span>
        <span className={`flex-1 min-w-0 font-mono text-xs leading-4 truncate ${summaryColor}`}>
          {output ?? '(no output)'}
        </span>
        <span
          className={`shrink-0 font-mono text-[10px] tracking-[0.04em] leading-3 ${actionColor}`}
        >
          {expanded ? '▾ close' : '▸ view'}
        </span>
      </button>
      {expanded && output ? (
        <div
          className={`bg-canvas border border-border-subtle border-l-2 mx-5 mb-2.5 px-[18px] py-3.5 overflow-x-auto ${
            isFailed ? 'border-l-status-failed' : 'border-l-gold'
          }`}
        >
          <pre className="font-mono text-[11px] leading-[19px] text-text-primary whitespace-pre m-0 w-max">
            {output}
          </pre>
        </div>
      ) : null}
    </>
  );
}
