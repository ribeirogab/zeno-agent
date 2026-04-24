import { createFileRoute, Link } from '@tanstack/react-router';
import type { DotTone } from '@zeno/ui';
import { Button, EmptyState, ErrorState, Kicker, Pill, Skeleton } from '@zeno/ui';
import type { JSX } from 'react';
import { CronRunHistoryRow } from '@/components/crons/cron-run-history-row';
import { IcoPlay } from '@/components/icons';
import { useDeleteCron, usePauseCron, useResumeCron, useRunNowCron } from '@/lib/mutations';
import { useCron } from '@/lib/use-cron';
import type { CronApi } from '@/lib/use-crons';

export const Route = createFileRoute('/_authed/crons/$id')({
  component: CronDetailPage,
});

function cronTone(cron: CronApi): DotTone {
  if (!cron.enabled) return 'paused';
  return 'active';
}

function CronDetailPage(): JSX.Element {
  const { id } = Route.useParams();
  const query = useCron(id);
  const pause = usePauseCron();
  const resume = useResumeCron();
  const runNow = useRunNowCron();
  const deleteCron = useDeleteCron();

  if (query.isLoading) {
    return (
      <div className="mx-auto flex max-w-[1080px] flex-col gap-10 px-12 pb-[120px] pt-10">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="mx-auto max-w-[1080px] px-12 pb-[120px] pt-10">
        <ErrorState onRetry={() => void query.refetch()} />
      </div>
    );
  }

  const { cron, recentRuns } = query.data;
  const tone = cronTone(cron);

  return (
    <div className="mx-auto flex max-w-[1080px] flex-col gap-10 px-12 pb-[120px] pt-10">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 font-mono text-[11px] tracking-[0.06em]">
        <Link
          to="/crons"
          className="border-0 bg-transparent p-0 font-mono text-[11px] uppercase tracking-[0.06em] text-text-tertiary transition-colors hover:text-text-primary"
        >
          crons
        </Link>
        <span className="text-text-tertiary">/</span>
        <span className="uppercase text-gold">{cron.name}</span>
      </nav>

      {/* Page header */}
      <header className="flex items-end justify-between gap-6 border-b border-border-subtle pb-6">
        <div>
          <h1 className="font-mono text-[28px] font-medium leading-tight tracking-[0.02em] text-text-primary">
            {cron.name}
          </h1>
          {cron.description && (
            <p className="mt-3 max-w-[620px] text-sm leading-relaxed text-text-secondary">
              {cron.description}
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="border border-gold-line bg-panel-2 px-2.5 py-1 font-mono text-[13px] text-gold">
              {cron.schedule}
            </span>
            <span className="text-text-tertiary">·</span>
            <Pill tone={tone}>{tone === 'paused' ? 'paused' : 'active'}</Pill>
            <span className="text-text-tertiary">·</span>
            <span className="text-[13px] text-text-secondary">
              source <span className="text-text-primary">{cron.source}</span>
            </span>
            {cron.nextRunAt && cron.enabled && (
              <>
                <span className="text-text-tertiary">·</span>
                <span className="text-[13px] text-text-secondary">
                  next{' '}
                  <span className="text-text-primary">
                    {new Date(cron.nextRunAt).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false,
                    })}
                  </span>
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="ghost"
            disabled={cron.enabled ? pause.isPending : resume.isPending}
            onClick={() => {
              if (cron.enabled) {
                pause.mutate(cron.id);
              } else {
                resume.mutate(cron.id);
              }
            }}
          >
            {cron.enabled ? 'pause' : 'resume'}
          </Button>
          <Button
            variant="primary"
            disabled={runNow.isPending || !cron.enabled}
            onClick={() => runNow.mutate(cron.id)}
          >
            <IcoPlay size={12} />
            run now
          </Button>
          {cron.source === 'chat' && (
            <Button
              variant="danger"
              size="sm"
              disabled={deleteCron.isPending}
              onClick={() => deleteCron.mutate(cron.id)}
            >
              delete
            </Button>
          )}
        </div>
      </header>

      {/* Prompt block */}
      {cron.prompt && (
        <section>
          <pre className="relative mt-3 whitespace-pre-wrap border border-border-subtle border-l-2 border-l-gold bg-panel px-6 py-[22px] font-mono text-[13px] leading-[1.75] text-text-primary before:absolute before:-top-2 before:left-3 before:bg-canvas before:px-2 before:font-mono before:text-[9px] before:uppercase before:tracking-[0.2em] before:text-gold before:content-['PROMPT']">
            {cron.prompt}
          </pre>
        </section>
      )}

      {/* Stats */}
      <section className="grid grid-cols-4 gap-px border border-border-subtle bg-border-subtle">
        <StatCell label="total runs" value={String(recentRuns.length)} sub="lifetime" />
        <StatCell label="success rate" value={successRate(recentRuns)} sub="last 30d" gold />
        <StatCell label="avg duration" value={avgDuration(recentRuns)} sub="recent runs" />
        <StatCell
          label="source"
          value={cron.source}
          sub={cron.source === 'chat' ? 'from slack' : 'config file'}
        />
      </section>

      {/* Run history */}
      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between border-b border-dashed border-border-subtle pb-2.5">
          <h2 className="font-sans text-lg font-medium tracking-[-0.005em] text-text-primary">
            run history
          </h2>
          <Kicker mute>{recentRuns.length} runs · click to expand</Kicker>
        </div>
        {recentRuns.length === 0 ? (
          <EmptyState title="no runs yet" />
        ) : (
          <div className="flex flex-col border border-border-subtle bg-panel py-1">
            {recentRuns.map((run) => (
              <CronRunHistoryRow key={run.id} run={run} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCell({
  label,
  value,
  sub,
  gold = false,
}: {
  label: string;
  value: string;
  sub: string;
  gold?: boolean;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-2 overflow-hidden bg-panel px-5 py-5 transition-colors hover:bg-panel-2">
      <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-text-tertiary">
        {label}
      </span>
      <span
        className={`font-serif text-[44px] font-normal leading-none tracking-[-0.02em] ${gold ? 'text-gold' : 'text-text-primary'}`}
        style={{ fontFeatureSettings: "'tnum' on, 'lnum' on" }}
      >
        {value}
      </span>
      <span className="font-mono text-[10px] tracking-[0.06em] text-text-tertiary">{sub}</span>
    </div>
  );
}

function successRate(runs: Array<{ status: string }>): string {
  if (runs.length === 0) return '—';
  const ok = runs.filter((r) => r.status === 'success').length;
  return `${Math.round((ok / runs.length) * 100)}%`;
}

function avgDuration(runs: Array<{ startedAt: string; finishedAt: string | null }>): string {
  const finished = runs.filter((r) => r.finishedAt);
  if (finished.length === 0) return '—';
  const total = finished.reduce((acc, r) => {
    return acc + (new Date(r.finishedAt as string).getTime() - new Date(r.startedAt).getTime());
  }, 0);
  return `${(total / finished.length / 1000).toFixed(1)}s`;
}
