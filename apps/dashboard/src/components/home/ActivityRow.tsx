import type { JSX } from 'react';
import type { Activity } from '@/lib/use-activity';

const statusColor: Record<Activity['status'], string> = {
  running: 'bg-status-active',
  success: 'bg-status-active',
  failed: 'bg-status-failed',
  skipped: 'bg-text-tertiary',
};

function fmt(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function ActivityRow({ activity }: { activity: Activity }): JSX.Element {
  return (
    <div className="flex items-center gap-4 border-b border-panel py-3.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center">
        <span className={`h-1.5 w-1.5 rounded-full ${statusColor[activity.status]}`} />
      </span>
      <span className="w-24 shrink-0 font-mono text-xs text-text-tertiary">
        {fmt(activity.timestamp)}
      </span>
      <span className="w-32 shrink-0 text-xs font-medium uppercase tracking-wider text-text-secondary">
        {activity.kind.replace('_', ' · ')}
      </span>
      <span className="flex-1 text-sm text-text-primary">{activity.summary}</span>
    </div>
  );
}
