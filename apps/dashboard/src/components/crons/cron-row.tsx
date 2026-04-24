import { Link } from '@tanstack/react-router';
import type { DotTone } from '@zeno/ui';
import { OutlinePill, Pill } from '@zeno/ui';
import type { JSX } from 'react';
import { CronRowActions } from '@/components/crons/cron-row-actions';
import { isTempId } from '@/lib/temp-id';
import type { CronApi } from '@/lib/use-crons';

function cronTone(cron: CronApi): DotTone {
  if (!cron.enabled) return 'paused';
  return 'active';
}

function formatNextRun(cron: CronApi): { primary: string; secondary: string } {
  if (!cron.enabled) return { primary: '—', secondary: 'paused' };
  if (!cron.nextRunAt) return { primary: '—', secondary: '' };
  const next = new Date(cron.nextRunAt);
  const now = new Date();
  const diffMs = next.getTime() - now.getTime();
  const diffMin = Math.max(0, Math.round(diffMs / 60000));
  const hours = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  const primary = hours > 0 ? `in ${hours}h ${mins}m` : `in ${mins}m`;
  const secondary = next.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return { primary, secondary };
}

export function CronRow({ cron }: { cron: CronApi }): JSX.Element {
  const pending = isTempId(cron.id);
  const tone = cronTone(cron);
  const nextRun = formatNextRun(cron);

  return (
    <Link
      to="/crons/$id"
      params={{ id: cron.id }}
      aria-disabled={pending}
      className={`group relative flex min-w-[840px] items-center gap-4 border-b border-border-subtle px-5 py-3.5 transition-colors last:border-b-0 hover:bg-panel-2 ${pending ? 'pointer-events-none opacity-60' : ''}`}
    >
      <span className="pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-gold opacity-0 transition-opacity group-hover:opacity-100" />

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-mono text-[13px] font-medium tracking-[0.02em] text-text-primary">
          {cron.name}
        </span>
        {cron.description && (
          <span className="truncate text-xs text-text-secondary">{cron.description}</span>
        )}
      </div>

      <div className="flex w-40 shrink-0 flex-col gap-0.5">
        <span className="font-mono text-xs text-gold">{cron.schedule}</span>
      </div>

      <div className="flex w-[140px] shrink-0 flex-col gap-0.5">
        <span
          className={`font-mono text-xs ${cron.enabled ? 'text-text-primary' : 'text-text-tertiary'}`}
        >
          {nextRun.primary}
        </span>
        {nextRun.secondary && (
          <span className="font-mono text-[10px] tracking-[0.04em] text-text-tertiary">
            {nextRun.secondary}
          </span>
        )}
      </div>

      <span className="w-[90px] shrink-0">
        <OutlinePill>{cron.source}</OutlinePill>
      </span>

      <span className="w-[108px] shrink-0">
        <Pill tone={tone}>{tone}</Pill>
      </span>

      <span className="flex w-[150px] shrink-0 justify-end">
        {!pending && <CronRowActions cron={cron} />}
      </span>
    </Link>
  );
}
