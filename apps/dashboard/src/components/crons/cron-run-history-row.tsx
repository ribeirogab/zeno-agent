import type { DotTone } from '@zeno/ui';
import { Dot } from '@zeno/ui';
import { type JSX, useState } from 'react';
import { isTempId } from '@/lib/temp-id';
import type { CronRunApi } from '@/lib/use-cron';

const toneLookup: Record<CronRunApi['status'], DotTone> = {
  running: 'active',
  success: 'active',
  failed: 'failed',
  skipped: 'idle',
};

function duration(run: CronRunApi): string {
  if (!run.finishedAt) return '...';
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

export function CronRunHistoryRow({ run }: { run: CronRunApi }): JSX.Element {
  const pending = isTempId(run.id);
  const [expanded, setExpanded] = useState(false);
  const tone = toneLookup[run.status];
  const isFailed = run.status === 'failed';
  const output = isFailed ? run.error : run.output;

  return (
    <>
      <button
        type="button"
        className={`relative flex w-full items-center gap-4 px-5 py-2.5 text-left font-mono text-xs transition-colors hover:bg-panel-2 ${pending ? 'opacity-60' : ''}`}
        onClick={() => setExpanded((prev) => !prev)}
      >
        <span className="flex w-1.5 shrink-0 justify-center">
          <Dot tone={tone} pulse={run.status === 'running'} />
        </span>
        <span className="w-[170px] shrink-0 font-mono text-xs text-text-secondary">
          {formatTimestamp(run.startedAt)}
        </span>
        <span
          className={`w-[60px] shrink-0 font-mono text-xs ${isFailed ? 'text-status-failed' : 'text-gold'}`}
        >
          {duration(run)}
        </span>
        <span
          className={`min-w-0 flex-1 truncate font-mono text-xs ${isFailed ? 'text-status-failed' : 'text-text-primary'}`}
        >
          {output ?? '(no output)'}
        </span>
        <span
          className={`shrink-0 font-mono text-[10px] tracking-[0.04em] ${expanded ? 'text-gold' : 'text-text-tertiary'}`}
        >
          {expanded ? '▾ close' : '▸ view'}
        </span>
      </button>
      {expanded && output && (
        <div
          className={`mx-5 mb-2.5 overflow-x-auto whitespace-pre border border-border-subtle border-l-2 bg-canvas px-[18px] py-3.5 font-mono text-[11px] leading-[1.7] text-text-primary ${isFailed ? 'border-l-status-failed' : 'border-l-gold'}`}
        >
          {output}
        </div>
      )}
    </>
  );
}
