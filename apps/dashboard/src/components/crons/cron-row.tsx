import { Link } from '@tanstack/react-router';
import cronstrue from 'cronstrue';
import type { JSX } from 'react';
import { type CronStatus, CronStatusPill } from '@/components/crons/cron-status-pill';
import type { CronApi } from '@/lib/use-crons';

/**
 * Spec 2026-05-22 (crons CLI-first): read-only row shape. No mutation
 * controls; the detail page's <CronActions> renders the action chips.
 */
export type CronTableRow = {
  id: string;
  name: string;
  description: string;
  scheduleExpr: string;
  scheduleHuman: string;
  nextRun: string;
  nextRunAbsolute: string;
  status: CronStatus;
  lastError: string | null;
};

export function CronRow({ row, last }: { row: CronTableRow; last?: boolean }): JSX.Element {
  const borderClass = last ? '' : 'border-b border-border-subtle';
  return (
    <Link
      to="/crons/$id"
      params={{ id: row.id }}
      className={`group/row relative flex items-center gap-4 px-5 py-3.5 ${borderClass} font-mono text-xs cursor-pointer transition-colors duration-[120ms] hover:bg-panel-2 min-w-[720px] before:content-[''] before:absolute before:left-0 before:inset-y-0 before:w-0.5 before:bg-gold before:opacity-0 hover:before:opacity-100 before:transition-opacity before:duration-[120ms]`}
    >
      <div className="flex-1 min-w-0 flex flex-col gap-[3px]">
        <span className="font-mono text-[13px] font-medium text-text-primary tracking-[0.02em] truncate">
          {row.name}
        </span>
        {row.description ? (
          <span className="font-sans text-xs text-text-secondary leading-[1.5] truncate">
            {row.description}
          </span>
        ) : null}
        {row.lastError ? (
          <span className="font-mono text-[11px] text-status-failed leading-[1.4] truncate">
            ⚠ {row.lastError}
          </span>
        ) : null}
      </div>

      <div className="w-[160px] shrink-0 flex flex-col gap-0.5 min-w-0">
        <span className="font-mono text-xs text-gold truncate">{row.scheduleExpr}</span>
        <span className="font-mono text-[10px] text-text-tertiary tracking-[0.04em] truncate">
          {row.scheduleHuman}
        </span>
      </div>

      <div className="w-[140px] shrink-0 flex flex-col gap-0.5 min-w-0">
        <span
          className={`font-mono text-xs truncate ${
            row.status === 'paused' ? 'text-text-tertiary' : 'text-text-primary'
          }`}
        >
          {row.nextRun}
        </span>
        <span className="font-mono text-[10px] text-text-tertiary tracking-[0.04em] truncate">
          {row.nextRunAbsolute}
        </span>
      </div>

      <span className="w-[108px] shrink-0 flex">
        <CronStatusPill status={row.status} />
      </span>
    </Link>
  );
}

// ─── Mapper from API model to table row ──────────────────────────────────────

export function cronToTableRow(cron: CronApi, now: Date = new Date()): CronTableRow {
  return {
    id: cron.id,
    name: cron.name,
    description: cron.description ?? '',
    scheduleExpr: cron.schedule,
    scheduleHuman: humanSchedule(cron.schedule),
    nextRun: nextRunRelative(cron, now),
    nextRunAbsolute: nextRunAbsolute(cron, now),
    status: cronStatus(cron),
    lastError: cron.lastError,
  };
}

function cronStatus(cron: CronApi): CronStatus {
  if (cron.lastError) return 'paused';
  if (!cron.enabled) return 'paused';
  return 'active';
}

function humanSchedule(schedule: string): string {
  try {
    return cronstrue.toString(schedule, { use24HourTimeFormat: true }).toLowerCase();
  } catch {
    return schedule;
  }
}

function nextRunRelative(cron: CronApi, now: Date): string {
  if (!cron.enabled) return '—';
  if (!cron.nextRunAt) return '—';
  const next = new Date(cron.nextRunAt);
  const diffMs = next.getTime() - now.getTime();
  const diffMin = Math.max(0, Math.round(diffMs / 60_000));
  const hours = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  return hours > 0 ? `in ${hours}h ${mins}m` : `in ${mins}m`;
}

function nextRunAbsolute(cron: CronApi, now: Date): string {
  if (!cron.enabled) return 'paused';
  if (!cron.nextRunAt) return '';
  const next = new Date(cron.nextRunAt);
  const pad = (n: number): string => String(n).padStart(2, '0');
  const time = `${pad(next.getHours())}:${pad(next.getMinutes())}`;
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dateStart = new Date(next.getFullYear(), next.getMonth(), next.getDate());
  const dayDiff = Math.round((dateStart.getTime() - todayStart.getTime()) / 86_400_000);
  if (dayDiff === 0) return `today · ${time}`;
  if (dayDiff === 1) return `tomorrow · ${time}`;
  return next.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
