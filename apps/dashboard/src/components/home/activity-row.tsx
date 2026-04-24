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
    <div className="zen-activity-row">
      <span className="zen-activity-dot">
        <Dot tone={statusTone[activity.status]} />
      </span>
      <span className="zen-ts">{fmt(activity.timestamp)}</span>
      <span className="zen-event">{activity.kind.replace('_', ' · ')}</span>
      <span className="zen-activity-summary">{activity.summary}</span>
    </div>
  );
}
