import type { JSX } from 'react';

export type CronStatus = 'active' | 'paused' | 'failed';

/**
 * Tinted status pill for the crons table. Visual reference:
 * `apps/design/src/routes/dashboard/crons/index.tsx` — `<StatusPill>`.
 */
export function CronStatusPill({ status }: { status: CronStatus }): JSX.Element {
  const wrapperCls = {
    active: 'border-status-active/30 bg-status-active/[0.06] text-status-active',
    paused: 'border-gold-line bg-gold-soft text-status-paused',
    failed: 'border-status-failed/30 bg-status-failed/[0.06] text-status-failed',
  }[status];
  const dotCls = {
    active: 'bg-status-active',
    paused: 'bg-status-paused',
    failed: 'bg-status-failed',
  }[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-[3px] border font-mono text-[10px] tracking-[0.1em] uppercase whitespace-nowrap ${wrapperCls}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotCls}`} />
      {status}
    </span>
  );
}
