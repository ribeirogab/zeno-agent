import { type JSX, useState } from 'react';
import { LogJsonBlock } from '@/components/logs/log-json-block';
import type { LogApi } from '@/lib/log-filters';

type LevelTone = 'active' | 'paused' | 'failed';

interface LevelMeta {
  label: 'INFO' | 'WARN' | 'ERROR';
  tone: LevelTone;
}

function levelMeta(level: number): LevelMeta {
  if (level >= 50) return { label: 'ERROR', tone: 'failed' };
  if (level >= 40) return { label: 'WARN', tone: 'paused' };
  return { label: 'INFO', tone: 'active' };
}

function fmtTs(iso: string): string {
  const d = new Date(iso);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  const ss = d.getSeconds().toString().padStart(2, '0');
  const ms = d.getMilliseconds().toString().padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

const DOT_BG: Record<LevelTone, string> = {
  active: 'bg-status-active',
  paused: 'bg-status-paused',
  failed: 'bg-status-failed',
};
const TEXT_TONE: Record<LevelTone, string> = {
  active: 'text-status-active',
  paused: 'text-status-paused',
  failed: 'text-status-failed',
};

/**
 * One row in the streaming log list. Visual reference:
 * `apps/design/src/routes/dashboard/logs/index.tsx` — `<LogRow>`. Click toggles
 * the JSON payload expansion below the row.
 */
export function LogRow({ log, isNew = false }: { log: LogApi; isNew?: boolean }): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const meta = levelMeta(log.level);

  return (
    <>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className={`flex items-center gap-4 px-5 py-2.5 cursor-pointer hover:bg-panel-2 transition-colors duration-[120ms] min-w-[760px] w-full text-left bg-transparent border-0 ${
          isNew ? 'animate-log-new' : ''
        }`}
      >
        <span className="shrink-0 w-1.5 flex justify-center">
          <span className={`w-1.5 h-1.5 rounded-full ${DOT_BG[meta.tone]}`} />
        </span>
        <span className="shrink-0 w-[100px] font-mono text-xs leading-4 text-text-tertiary">
          {fmtTs(log.ts)}
        </span>
        <span
          className={`shrink-0 w-[50px] font-mono text-[10px] font-semibold tracking-[0.15em] leading-3 ${TEXT_TONE[meta.tone]}`}
        >
          {meta.label}
        </span>
        <span className="shrink-0 w-[210px] font-mono text-[11px] leading-[14px] text-gold truncate">
          {log.event ?? '—'}
        </span>
        <span className="flex-1 min-w-0 font-mono text-xs leading-4 text-text-primary truncate">
          {log.message ?? '(no message)'}
        </span>
        <span className="shrink-0 w-[120px] font-mono text-[10px] tracking-[0.04em] leading-3 text-text-tertiary text-right">
          {log.correlationId ?? '—'}
        </span>
      </button>
      {expanded ? (
        <div className="mx-5 mb-2.5">
          <LogJsonBlock payload={log.payload} levelTone={meta.tone} />
        </div>
      ) : null}
    </>
  );
}
