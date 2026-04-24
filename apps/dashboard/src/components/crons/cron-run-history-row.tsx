import { Dot } from '@zeno/ui';
import type { DotTone } from '@zeno/ui';
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
        className={`flex w-full items-center gap-4 border-b border-border-subtle px-2 py-3 text-left transition-colors hover:bg-panel-2 ${pending ? 'opacity-60' : ''}`}
        onClick={() => setExpanded((prev) => !prev)}
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center">
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
          className={`flex-1 truncate font-mono text-xs ${isFailed ? 'text-status-failed' : 'text-text-primary'}`}
        >
          {output ?? '(no output)'}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-text-tertiary">
          {expanded ? '▾ close' : '▸ view'}
        </span>
      </button>
      {expanded && output && (
        <div
          className={`whitespace-pre-wrap border-b border-l-2 bg-panel px-6 py-4 font-mono text-xs leading-relaxed text-text-secondary ${isFailed ? 'border-l-status-failed' : 'border-l-gold'}`}
        >
          {output}
        </div>
      )}
    </>
  );
}
