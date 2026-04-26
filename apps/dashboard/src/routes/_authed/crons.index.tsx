import { createFileRoute } from '@tanstack/react-router';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { CronRow, type CronTableRow, cronToTableRow } from '@/components/crons/cron-row';
import { DashboardTopstrip } from '@/components/layout/dashboard-topstrip';
import { DeleteCronModal } from '@/components/modals/delete-cron-modal';
import { NewCronModal } from '@/components/modals/new-cron-modal';
import { CronsTableSkeleton } from '@/components/skeletons/crons-table-skeleton';
import { useCreateCron, useDeleteCron } from '@/lib/mutations';
import type { CronApi } from '@/lib/use-crons';
import { useCrons } from '@/lib/use-crons';
import { useHealth } from '@/lib/use-health';

export const Route = createFileRoute('/_authed/crons/')({
  component: CronsListScreen,
});

const TICK_INTERVAL_S = 60;

function useNextTickCountdown(lastTickAt: string | null | undefined): string {
  const [label, setLabel] = useState('');

  useEffect(() => {
    if (!lastTickAt) {
      setLabel('');
      return;
    }
    function compute(): void {
      const lastTick = new Date(lastTickAt as string).getTime();
      const nextTick = lastTick + TICK_INTERVAL_S * 1000;
      const remaining = Math.max(0, Math.round((nextTick - Date.now()) / 1000));
      setLabel(`next tick in ${remaining}s`);
    }
    compute();
    const id = setInterval(compute, 1000);
    return () => clearInterval(id);
  }, [lastTickAt]);

  return label;
}

function CronsListScreen(): JSX.Element {
  const crons = useCrons();
  const health = useHealth();
  const createCron = useCreateCron();
  const deleteCron = useDeleteCron();
  const nextTickLabel = useNextTickCountdown(health.data?.lastTickAt);

  const [showNew, setShowNew] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<CronApi | null>(null);

  const rows: CronTableRow[] = (crons.data ?? []).map((c) => cronToTableRow(c));
  const counts = {
    total: rows.length,
    active: rows.filter((r) => r.status === 'active').length,
    paused: rows.filter((r) => r.status === 'paused').length,
    failing: rows.filter((r) => r.status === 'failed').length,
  };

  return (
    <>
      <DashboardTopstrip crumbs={[{ label: 'crons', current: true }]} />
      <div className="max-w-[1080px] w-full mx-auto px-12 pt-10 pb-30 flex flex-col gap-10 min-w-0">
        <Header onNewCron={() => setShowNew(true)} />
        {crons.isLoading || !crons.data ? (
          <CronsTableSkeleton />
        ) : rows.length === 0 ? (
          <CronsEmpty />
        ) : (
          <CronsTable
            rows={rows}
            onDelete={(row) => requestDelete(crons.data, row, setPendingDelete)}
          />
        )}
        <Footer
          counts={counts}
          runnerLabel={`runner · ticking${nextTickLabel ? ` · ${nextTickLabel}` : ''}`}
        />
      </div>
      <NewCronModal
        open={showNew}
        onOpenChange={setShowNew}
        onCreate={(input) => createCron.mutateAsync(input)}
      />
      <DeleteCronModal
        open={pendingDelete !== null}
        onOpenChange={(v) => {
          if (!v) setPendingDelete(null);
        }}
        cron={pendingDelete}
        onConfirm={() => {
          if (pendingDelete) deleteCron.mutate(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
    </>
  );
}

function requestDelete(
  crons: CronApi[] | undefined,
  row: CronTableRow,
  set: (cron: CronApi | null) => void,
): void {
  const found = crons?.find((c) => c.id === row.id);
  if (found) set(found);
}

// ─── Header ───────────────────────────────────────────────────────────────────

function Header({ onNewCron }: { onNewCron: () => void }): JSX.Element {
  return (
    <header className="flex items-end justify-between gap-6 border-b border-border-subtle pb-6">
      <div className="flex flex-col gap-0 min-w-0">
        <span className="font-mono text-[11px] font-medium tracking-[0.18em] uppercase text-gold whitespace-nowrap">
          scheduled tasks
        </span>
        <h1 className="font-sans text-[32px] font-medium tracking-[-0.015em] text-text-primary mt-2 m-0">
          crons
        </h1>
        <p className="font-sans text-sm leading-[1.6] text-text-secondary mt-2.5 m-0 max-w-[620px]">
          Recurring tasks. <InlineCode>static</InlineCode> lives in{' '}
          <InlineCode>profile/crons.yaml</InlineCode>; <InlineCode>chat</InlineCode> crons came from
          Slack.
        </p>
      </div>
      <button
        type="button"
        onClick={onNewCron}
        className="self-end shrink-0 inline-flex items-center gap-2 px-3.5 py-2 border border-gold-line text-gold font-mono text-xs font-medium tracking-[0.06em] uppercase whitespace-nowrap hover:border-gold hover:bg-gold-soft transition-colors duration-[120ms]"
      >
        <PlusIcon />
        new cron
      </button>
    </header>
  );
}

function InlineCode({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <span className="font-mono text-xs bg-panel-2 border border-border-subtle text-gold px-1.5 py-px">
      {children}
    </span>
  );
}

// ─── Table ────────────────────────────────────────────────────────────────────

function CronsTable({
  rows,
  onDelete,
}: {
  rows: CronTableRow[];
  onDelete: (row: CronTableRow) => void;
}): JSX.Element {
  return (
    <div className="border border-border-subtle bg-panel min-w-0 overflow-x-auto">
      <Thead />
      {rows.map((row, i) => (
        <CronRow key={row.id} row={row} last={i === rows.length - 1} onDelete={onDelete} />
      ))}
    </div>
  );
}

function Thead(): JSX.Element {
  return (
    <div className="flex items-center gap-4 px-5 py-3 border-b border-border-subtle bg-sidebar font-mono text-[10px] tracking-[0.18em] uppercase text-text-tertiary min-w-[840px]">
      <span className="flex-1 min-w-0">name</span>
      <span className="w-[160px] shrink-0">schedule</span>
      <span className="w-[140px] shrink-0">next run</span>
      <span className="w-[90px] shrink-0">source</span>
      <span className="w-[108px] shrink-0">status</span>
      <span className="w-[150px] shrink-0 text-right">actions</span>
    </div>
  );
}

// ─── Empty ────────────────────────────────────────────────────────────────────

function CronsEmpty(): JSX.Element {
  return (
    <div className="border border-border-subtle bg-panel px-10 py-16 flex flex-col items-center text-center gap-4 min-w-0">
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20">
        <path d="M10 0 L20 10 L10 20 L0 10 Z" stroke="#D9B362" fill="none" strokeWidth="1.5" />
      </svg>
      <h3 className="m-0 font-serif text-2xl tracking-[-0.02em] leading-7 text-text-primary">
        No crons yet.
      </h3>
      <p className="m-0 max-w-[460px] font-sans text-[13px] leading-[1.6] text-text-secondary">
        Schedule your first task — a morning standup, a weekly digest, a health-check ping. Or drop
        a YAML entry into <span className="font-mono text-gold">profile/crons.yaml</span> and Zeno
        hot-reloads.
      </p>
    </div>
  );
}

// ─── Footer ──────────────────────────────────────────────────────────────────

function Footer({
  counts,
  runnerLabel,
}: {
  counts: { total: number; active: number; paused: number; failing: number };
  runnerLabel: string;
}): JSX.Element {
  return (
    <div className="flex justify-between gap-3 py-1 px-0.5 font-mono text-[10px] text-text-tertiary tracking-[0.04em]">
      <span className="whitespace-nowrap">
        {counts.total} crons · {counts.active} active · {counts.paused} paused · {counts.failing}{' '}
        failing
      </span>
      <span className="whitespace-nowrap">{runnerLabel}</span>
    </div>
  );
}

function PlusIcon(): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
