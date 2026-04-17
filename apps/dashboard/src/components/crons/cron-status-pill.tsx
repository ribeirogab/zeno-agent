import type { JSX } from 'react';
import type { CronApi } from '@/lib/use-crons';

export function CronStatusPill({ cron }: { cron: CronApi }): JSX.Element {
  const color = cron.enabled ? 'bg-status-active' : 'bg-status-paused';
  const label = cron.enabled ? 'Active' : 'Paused';
  return (
    <div className="flex items-center gap-2">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${color}`} />
      <span className="text-sm text-text-primary">{label}</span>
    </div>
  );
}
