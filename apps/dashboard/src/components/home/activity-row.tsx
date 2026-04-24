import type { DotTone } from '@zeno/ui';
import { Dot } from '@zeno/ui';
import type { JSX } from 'react';
import type { Activity } from '@/lib/use-activity';

const statusTone: Record<Activity['status'], DotTone> = {
  running: 'active',
  success: 'active',
  failed: 'failed',
  skipped: 'idle',
};

function fmt(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function ActivityRow({ activity }: { activity: Activity }): JSX.Element {
  return (
    <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-3">
      <Dot tone={statusTone[activity.status]} />
      <span className="w-[78px] shrink-0 font-mono text-[11px] text-text-tertiary">
        {fmt(activity.timestamp)}
      </span>
      <span className="w-[150px] shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-gold">
        {activity.kind.replace('_', ' · ')}
      </span>
      <span className="flex-1 truncate font-mono text-[12px] text-text-secondary">
        {activity.summary}
      </span>
    </div>
  );
}
