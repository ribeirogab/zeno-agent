import { type JSX, useState } from 'react';
import { LogJsonBlock } from '@/components/logs/log-json-block';
import type { LogApi } from '@/lib/log-filters';
import { cn } from '@/lib/utils';

function levelLabel(level: number): { text: string; colorClass: string; dotClass: string } {
  if (level >= 50)
    return { text: 'ERROR', colorClass: 'text-status-failed', dotClass: 'bg-status-failed' };
  if (level >= 40)
    return { text: 'WARN', colorClass: 'text-status-paused', dotClass: 'bg-status-paused' };
  if (level >= 30)
    return { text: 'INFO', colorClass: 'text-status-active', dotClass: 'bg-status-active' };
  return { text: 'DEBUG', colorClass: 'text-text-tertiary', dotClass: 'bg-text-tertiary' };
}

function fmtTs(iso: string): string {
  const d = new Date(iso);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  const ss = d.getSeconds().toString().padStart(2, '0');
  const ms = d.getMilliseconds().toString().padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

export function LogRow({ log }: { log: LogApi }): JSX.Element {
  const [expanded, setExpanded] = useState<boolean>(false);
  const level = levelLabel(log.level);
  return (
    <div className="flex flex-col border-b border-panel">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex items-start gap-4 py-2.5 text-left hover:bg-panel/40"
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center">
          <span className={cn('h-1.5 w-1.5 rounded-full', level.dotClass)} />
        </span>
        <span className="w-24 shrink-0 font-mono text-[11px] text-text-tertiary">
          {fmtTs(log.ts)}
        </span>
        <span
          className={cn(
            'w-14 shrink-0 text-[11px] font-medium uppercase tracking-wider',
            level.colorClass,
          )}
        >
          {level.text}
        </span>
        <span className="w-48 shrink-0 truncate font-mono text-xs text-text-primary">
          {log.event ?? '—'}
        </span>
        <span className="flex-1 truncate text-xs text-text-secondary">
          {log.message ?? '(no message)'}
        </span>
      </button>
      {expanded && (
        <div className="pb-4 pl-12">
          <LogJsonBlock payload={log.payload} />
        </div>
      )}
    </div>
  );
}
