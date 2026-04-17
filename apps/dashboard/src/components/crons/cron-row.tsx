import { Link } from '@tanstack/react-router';
import type { JSX } from 'react';
import { CronStatusPill } from '@/components/crons/cron-status-pill';
import type { CronApi } from '@/lib/use-crons';

export function CronRow({ cron }: { cron: CronApi }): JSX.Element {
  return (
    <Link
      to="/crons/$id"
      params={{ id: cron.id }}
      className="flex items-center gap-4 border-b border-panel py-4 hover:bg-panel/40"
    >
      <div className="flex flex-1 flex-col gap-1 min-w-0">
        <span className="text-sm font-medium text-text-primary">{cron.name}</span>
        {cron.description && (
          <span className="truncate text-xs text-text-secondary">{cron.description}</span>
        )}
      </div>
      <span className="w-40 shrink-0 font-mono text-sm text-text-primary">{cron.schedule}</span>
      <span className="w-24 shrink-0 rounded-full border border-border-subtle px-2 py-0.5 text-center text-[11px] uppercase tracking-wider text-text-secondary">
        {cron.source}
      </span>
      <div className="w-24 shrink-0">
        <CronStatusPill cron={cron} />
      </div>
    </Link>
  );
}
