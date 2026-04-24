import { Dot, cn } from '@zeno/ui';
import { type JSX, useState } from 'react';
import { LogJsonBlock } from '@/components/logs/log-json-block';
import type { LogApi } from '@/lib/log-filters';

type LevelMeta = {
  text: string;
  colorClass: string;
  dotTone: 'active' | 'paused' | 'failed' | 'idle';
};

function levelLabel(level: number): LevelMeta {
  if (level >= 50)
    return { text: 'ERROR', colorClass: 'text-status-failed', dotTone: 'failed' };
  if (level >= 40)
    return { text: 'WARN', colorClass: 'text-status-paused', dotTone: 'paused' };
  if (level >= 30)
    return { text: 'INFO', colorClass: 'text-status-active', dotTone: 'active' };
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

function dotToneToLevelTone(tone: 'active' | 'paused' | 'failed' | 'idle'): 'active' | 'paused' | 'failed' {
  if (tone === 'failed') return 'failed';
  if (tone === 'paused') return 'paused';
  return 'active';
}

export function LogRow({
  log,
  isNew = false,
}: {
  log: LogApi;
  isNew?: boolean;
}): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const level = levelLabel(log.level);

  return (
    <div className="flex flex-col border-b border-border-subtle">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className={cn(
          'flex items-center gap-3 py-2.5 text-left transition-colors hover:bg-panel/40',
          isNew && 'animate-log-new',
        )}
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center">
          <Dot tone={level.dotTone} />
        </span>
        <span className="w-[100px] shrink-0 font-mono text-[11px] text-text-tertiary">
          {fmtTs(log.ts)}
        </span>
        <span
          className={cn(
            'w-[50px] shrink-0 font-mono text-[10px] font-bold uppercase',
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
        <span className="hidden w-[120px] shrink-0 text-right font-mono text-[11px] text-text-tertiary sm:inline">
          {log.correlationId ?? '—'}
        </span>
      </button>
      {expanded && (
        <div className="pb-4 pl-12">
          <LogJsonBlock payload={log.payload} levelTone={dotToneToLevelTone(level.dotTone)} />
        </div>
      )}
    </div>
  );
}
