import { cn, Dot } from '@zeno/ui';
import { type JSX, useState } from 'react';
import { LogJsonBlock } from '@/components/logs/log-json-block';
import type { LogApi } from '@/lib/log-filters';

type LevelMeta = {
  text: string;
  colorClass: string;
  dotTone: 'active' | 'paused' | 'failed' | 'idle';
};

function levelLabel(level: number): LevelMeta {
  if (level >= 50) return { text: 'ERROR', colorClass: 'text-status-failed', dotTone: 'failed' };
  if (level >= 40) return { text: 'WARN', colorClass: 'text-status-paused', dotTone: 'paused' };
  if (level >= 30) return { text: 'INFO', colorClass: 'text-status-active', dotTone: 'active' };
  return { text: 'DEBUG', colorClass: 'text-text-tertiary', dotTone: 'idle' };
}

function fmtTs(iso: string): string {
  const d = new Date(iso);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  const ss = d.getSeconds().toString().padStart(2, '0');
  const ms = d.getMilliseconds().toString().padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

function dotToneToLevelTone(
  tone: 'active' | 'paused' | 'failed' | 'idle',
): 'active' | 'paused' | 'failed' {
  if (tone === 'failed') return 'failed';
  if (tone === 'paused') return 'paused';
  return 'active';
}

export function LogRow({ log, isNew = false }: { log: LogApi; isNew?: boolean }): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const level = levelLabel(log.level);

  return (
    <>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className={cn(
          'flex cursor-pointer items-center gap-4 px-5 py-2.5 font-mono text-xs transition-colors hover:bg-panel-2',
          isNew && 'animate-log-new',
        )}
      >
        <span className="flex w-1.5 shrink-0 justify-center">
          <Dot tone={level.dotTone} />
        </span>
        <span className="w-[100px] shrink-0 font-mono text-xs text-text-tertiary">
          {fmtTs(log.ts)}
        </span>
        <span
          className={cn(
            'w-[50px] shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.15em]',
            level.colorClass,
          )}
        >
          {level.text}
        </span>
        <span className="w-[210px] shrink-0 truncate font-mono text-[11px] text-gold">
          {log.event ?? '—'}
        </span>
        <span className="flex-1 truncate font-mono text-xs text-text-primary">
          {log.message ?? '(no message)'}
        </span>
        <span className="w-[120px] shrink-0 text-right font-mono text-[10px] tracking-[0.04em] text-text-tertiary">
          {log.correlationId ?? '—'}
        </span>
      </button>
      {expanded && (
        <div className="mx-5 mb-2.5">
          <LogJsonBlock payload={log.payload} levelTone={dotToneToLevelTone(level.dotTone)} />
        </div>
      )}
    </>
  );
}
