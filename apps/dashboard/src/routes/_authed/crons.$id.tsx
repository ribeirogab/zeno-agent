import { createFileRoute } from '@tanstack/react-router';
import { ErrorState } from '@zeno/ui';
import cronstrue from 'cronstrue';
import { type JSX, type ReactNode, useEffect, useState } from 'react';
import { CronActions } from '@/components/crons/cron-actions';
import { CronRunHistoryRow } from '@/components/crons/cron-run-history-row';
import { type CronStatus, CronStatusPill } from '@/components/crons/cron-status-pill';
import { DashboardTopstrip } from '@/components/layout/dashboard-topstrip';
import { CronDetailRunsSkeleton } from '@/components/skeletons/cron-detail-runs-skeleton';
import { apiFetch } from '@/lib/api-client';
import { type CronRunApi, useCron } from '@/lib/use-cron';
import type { CronApi } from '@/lib/use-crons';

export const Route = createFileRoute('/_authed/crons/$id')({
  component: CronDetailScreen,
});

function CronDetailScreen(): JSX.Element {
  const { id } = Route.useParams();
  const query = useCron(id);
  const [source, setSource] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ raw: string }>(`/api/crons/${id}/source`)
      .then((r) => {
        if (!cancelled) setSource(r.raw);
      })
      .catch(() => {
        if (!cancelled) setSource(null);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (query.isLoading) {
    return (
      <>
        <DashboardTopstrip
          crumbs={[
            { label: 'crons', to: '/crons' },
            { label: '…', current: true },
          ]}
        />
        <div className="max-w-[1080px] w-full mx-auto px-12 pt-10 pb-30 flex flex-col gap-10 min-w-0">
          <CronDetailRunsSkeleton />
        </div>
      </>
    );
  }

  if (query.isError || !query.data) {
    return (
      <>
        <DashboardTopstrip
          crumbs={[
            { label: 'crons', to: '/crons' },
            { label: '…', current: true },
          ]}
        />
        <div className="max-w-[1080px] w-full mx-auto px-12 pt-10 pb-30 flex flex-col gap-10 min-w-0">
          <ErrorState
            title="cron not found"
            description="this cron could not be loaded."
            onRetry={() => void query.refetch()}
          />
        </div>
      </>
    );
  }

  const { cron, recentRuns } = query.data;
  const status: CronStatus = cron.enabled && !cron.lastError ? 'active' : 'paused';
  const body = source ? extractBody(source) : null;

  return (
    <>
      <DashboardTopstrip
        crumbs={[
          { label: 'crons', to: '/crons' },
          { label: cron.name, current: true },
        ]}
      />
      <div className="max-w-[1080px] w-full mx-auto px-12 pt-10 pb-30 flex flex-col gap-10 min-w-0">
        <Header cron={cron} status={status} />
        {cron.lastError ? <ErrorBanner error={cron.lastError} /> : null}
        {body !== null ? <PromptBlock prompt={body} /> : null}
        <StatsStrip runs={recentRuns} />
        <RunHistory runs={recentRuns} />
      </div>
    </>
  );
}

function Header({ cron, status }: { cron: CronApi; status: CronStatus }): JSX.Element {
  return (
    <header className="flex items-end justify-between gap-6 border-b border-border-subtle pb-6">
      <div className="flex flex-col flex-1 min-w-0">
        <h1 className="font-mono text-[28px] font-medium tracking-[0.02em] leading-[34px] text-text-primary m-0">
          {cron.name}
        </h1>
        {cron.description ? (
          <p className="mt-3 max-w-[620px] m-0 font-sans text-sm leading-[1.6] text-text-secondary">
            {cron.description}
          </p>
        ) : null}
        <MetaBar cron={cron} status={status} />
      </div>
      <CronActions cron={cron} />
    </header>
  );
}

function MetaBar({ cron, status }: { cron: CronApi; status: CronStatus }): JSX.Element {
  const human = humanSchedule(cron.schedule);
  const nextRun = formatNextRun(cron);
  return (
    <div className="flex items-center flex-wrap gap-3 mt-4">
      <span className="bg-panel-2 border border-gold-line px-2.5 py-1 font-mono text-[13px] leading-4 text-gold">
        {cron.schedule}
      </span>
      <span className="font-mono text-[13px] leading-4 text-text-secondary">{human}</span>
      <Sep />
      <CronStatusPill status={status} />
      <Sep />
      <span className="font-sans text-[13px] leading-4 text-text-secondary">
        slug <code className="font-mono text-gold">{cron.id}</code>
      </span>
      {nextRun ? (
        <>
          <Sep />
          <span className="font-sans text-[13px] leading-4 text-text-secondary">{nextRun}</span>
        </>
      ) : null}
    </div>
  );
}

function Sep(): JSX.Element {
  return <span className="font-sans text-base leading-5 text-text-tertiary select-none">·</span>;
}

function ErrorBanner({ error }: { error: string }): JSX.Element {
  return (
    <div className="border border-status-failed/60 bg-status-failed/10 px-5 py-3 font-mono text-[12px] text-status-failed leading-[1.5]">
      ⚠ {error}
    </div>
  );
}

function PromptBlock({ prompt }: { prompt: string }): JSX.Element {
  return (
    <div className="relative bg-panel border border-border-subtle border-l-2 border-l-gold mt-3 px-6 py-[22px]">
      <pre className="font-mono text-[13px] leading-[23px] text-text-primary whitespace-pre-wrap m-0">
        {prompt}
      </pre>
      <span className="absolute -top-2 left-3 px-2 bg-canvas font-mono text-[9px] tracking-[0.2em] leading-4 text-gold">
        PROMPT
      </span>
    </div>
  );
}

function StatsStrip({ runs }: { runs: CronRunApi[] }): JSX.Element {
  const total = runs.length;
  const succ = runs.filter((r) => r.status === 'success').length;
  const successRate = total > 0 ? Math.round((succ / total) * 100) : 0;
  const completed = runs.filter((r) => r.finishedAt);
  const avgMs =
    completed.length > 0
      ? completed.reduce((acc, r) => {
          const ms = r.finishedAt
            ? new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime()
            : 0;
          return acc + ms;
        }, 0) / completed.length
      : 0;
  const avgSec = (avgMs / 1000).toFixed(1);

  return (
    <div className="flex gap-px bg-border-subtle border border-border-subtle">
      <StatCell label="total runs">
        <ValueLg>{total}</ValueLg>
        <Caption>recent</Caption>
      </StatCell>
      <StatCell label="success rate">
        <ValueLg gold>{successRate}%</ValueLg>
        <Caption>last {total} runs</Caption>
      </StatCell>
      <StatCell label="avg duration">
        <span className="flex items-baseline">
          <span className="font-serif text-[44px] tracking-[-0.02em] leading-none text-text-primary">
            {avgSec}
          </span>
          <span className="font-serif text-[20px] tracking-[-0.02em] leading-none text-text-tertiary">
            s
          </span>
        </span>
        <Caption>{completed.length} completed</Caption>
      </StatCell>
    </div>
  );
}

function StatCell({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div className="flex-1 flex flex-col gap-2 bg-panel pt-5 px-5 pb-[18px]">
      <span className="font-mono text-[10px] tracking-[0.18em] leading-3 uppercase text-text-tertiary">
        {label}
      </span>
      {children}
    </div>
  );
}

function ValueLg({ children, gold }: { children: ReactNode; gold?: boolean }): JSX.Element {
  return (
    <span
      className={`font-serif text-[44px] tracking-[-0.02em] leading-none ${
        gold ? 'text-gold' : 'text-text-primary'
      }`}
    >
      {children}
    </span>
  );
}

function Caption({ children }: { children: ReactNode }): JSX.Element {
  return (
    <span className="font-mono text-[10px] tracking-[0.06em] leading-3 text-text-tertiary">
      {children}
    </span>
  );
}

function RunHistory({ runs }: { runs: CronRunApi[] }): JSX.Element {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between border-b border-dashed border-border-subtle pb-2.5">
        <h2 className="font-sans text-lg font-medium tracking-[-0.005em] leading-[22px] text-text-primary m-0">
          run history
        </h2>
        <span className="font-mono text-[10px] tracking-[0.2em] leading-3 uppercase text-text-tertiary">
          {runs.length === 0
            ? 'no runs yet'
            : `last ${runs.length} run${runs.length === 1 ? '' : 's'} · click to expand`}
        </span>
      </div>
      {runs.length === 0 ? (
        <div className="bg-panel border border-border-subtle px-5 py-6 font-mono text-xs text-text-tertiary text-center">
          test the cron from your terminal to see results here.
        </div>
      ) : (
        <div className="bg-panel border border-border-subtle py-1 flex flex-col">
          {runs.map((r) => (
            <CronRunHistoryRow key={r.id} run={r} />
          ))}
        </div>
      )}
    </section>
  );
}

function extractBody(raw: string): string {
  const m = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/);
  return (m?.[1] ?? raw).trim();
}

function humanSchedule(cron: string): string {
  try {
    return cronstrue.toString(cron, { use24HourTimeFormat: true }).toLowerCase();
  } catch {
    return cron;
  }
}

function formatNextRun(cron: CronApi): string {
  if (!cron.enabled) return 'paused';
  if (!cron.nextRunAt) return '';
  const next = new Date(cron.nextRunAt);
  const diff = next.getTime() - Date.now();
  if (diff <= 0) return 'next now';
  const min = Math.floor(diff / 60_000);
  const hours = Math.floor(min / 60);
  const mins = min % 60;
  return hours > 0 ? `next in ${hours}h ${mins}m` : `next in ${mins}m`;
}
