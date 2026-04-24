import { Link } from '@tanstack/react-router';
import { OutlinePill, Pill } from '@zeno/ui';
import type { DotTone } from '@zeno/ui';
import type { JSX } from 'react';
import { useState } from 'react';
import { CronRowActions } from '@/components/crons/cron-row-actions';
import { isTempId } from '@/lib/temp-id';
import type { CronApi } from '@/lib/use-crons';

function cronTone(cron: CronApi): DotTone {
  if (!cron.enabled) return 'paused';
  return 'active';
}

function formatNextRun(cron: CronApi): string {
  if (!cron.enabled) return '—';
  if (!cron.nextRunAt) return '—';
  const next = new Date(cron.nextRunAt);
  return next.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function CronRow({ cron }: { cron: CronApi }): JSX.Element {
  const pending = isTempId(cron.id);
  const [hovered, setHovered] = useState(false);
  const tone = cronTone(cron);

  return (
    <Link
      to="/crons/$id"
      params={{ id: cron.id }}
      aria-disabled={pending}
      className={`group relative flex items-center gap-4 border-b border-border-subtle px-5 py-3.5 transition-colors hover:bg-panel-2 ${pending ? 'pointer-events-none opacity-60' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span className="pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-gold opacity-0 transition-opacity group-hover:opacity-100" />

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium text-text-primary">{cron.name}</span>
        {cron.description && (
          <span className="truncate text-xs text-text-secondary">{cron.description}</span>
        )}
      </div>

      <div className="flex w-40 shrink-0 flex-col gap-0.5">
        <span className="font-mono text-sm text-gold">{cron.schedule}</span>
      </div>

      <div className="flex w-[140px] shrink-0 flex-col gap-0.5">
        <span className="text-xs text-text-secondary">{formatNextRun(cron)}</span>
      </div>

      <span className="w-[90px] shrink-0">
        <OutlinePill>{cron.source}</OutlinePill>
      </span>

      <span className="w-[108px] shrink-0">
        <Pill tone={tone}>{tone}</Pill>
      </span>

      <span className="flex w-[150px] shrink-0 justify-end">
        {hovered && !pending && (
          <CronRowActions cron={cron} />
        )}
      </span>
    </Link>
  );
}
