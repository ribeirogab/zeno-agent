import { Dot, type DotTone } from '@zeno/ui';
import type { JSX } from 'react';

export interface ActivityRowData {
  /** Time-of-day label, e.g. "23:42:00" */
  ts: string;
  /** Kind label, e.g. "cron · run" */
  kind: string;
  /** Human-readable summary */
  summary: string;
  /** Dot color tone */
  tone: DotTone;
}

/**
 * One row in the recent-activity stream on Home. Visual reference:
 * `apps/design/src/routes/dashboard/home/index.tsx` — `<ActivityRow>`.
 */
export function ActivityRow({ row }: { row: ActivityRowData }): JSX.Element {
  return (
    <div className="flex items-center gap-4 px-5 py-2.5 font-mono text-xs transition-colors hover:bg-panel-2">
      <div className="w-1.5 flex justify-center shrink-0">
        <Dot tone={row.tone} />
      </div>
      <span className="w-[78px] text-text-tertiary shrink-0">{row.ts}</span>
      <span className="w-[150px] text-gold text-[10px] tracking-[0.1em] uppercase shrink-0">
        {row.kind}
      </span>
      <span className="flex-1 text-text-secondary text-xs min-w-0 truncate">{row.summary}</span>
    </div>
  );
}
