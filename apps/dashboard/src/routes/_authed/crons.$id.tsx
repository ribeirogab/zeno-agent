import { createFileRoute, Link } from '@tanstack/react-router';
import { EmptyState, ErrorState, Skeleton } from '@zeno/ui';
import type { JSX } from 'react';
import { CronActions } from '@/components/crons/cron-actions';
import { CronRunHistoryRow } from '@/components/crons/cron-run-history-row';
import { CronStatusPill } from '@/components/crons/cron-status-pill';
import { useCron } from '@/lib/use-cron';

export const Route = createFileRoute('/_authed/crons/$id')({
  component: CronDetailPage,
});

function CronDetailPage(): JSX.Element {
  const { id } = Route.useParams();
  const query = useCron(id);

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return <ErrorState onRetry={() => void query.refetch()} />;
  }

  const { cron, recentRuns } = query.data;

  return (
    <div className="flex flex-col gap-10">
      <nav className="text-xs text-text-tertiary">
        <Link to="/crons" className="hover:text-text-secondary">
          Crons
        </Link>
        <span className="mx-2">/</span>
        <span className="text-text-secondary">{cron.name}</span>
      </nav>

      <header className="flex flex-col gap-3">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:gap-6">
          <h1 className="font-serif text-3xl leading-tight text-text-primary sm:text-4xl">
            {cron.name}
          </h1>
          <CronActions cron={cron} />
        </div>
        {cron.description && (
          <p className="max-w-[640px] text-sm text-text-secondary">{cron.description}</p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-border-subtle bg-panel px-2.5 py-1 font-mono text-xs text-text-primary">
            {cron.schedule}
          </span>
          <CronStatusPill cron={cron} />
          <span className="text-xs text-text-tertiary">
            source <span className="text-text-primary">{cron.source}</span>
          </span>
        </div>
      </header>

      <section className="flex flex-col gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
          Prompt
        </span>
        <pre className="whitespace-pre-wrap rounded-lg border border-border-subtle bg-panel p-5 font-mono text-xs text-text-primary">
          {cron.prompt}
        </pre>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-base font-semibold text-text-primary">Run history</h2>
        {recentRuns.length === 0 ? (
          <EmptyState title="no runs yet" />
        ) : (
          recentRuns.map((run) => <CronRunHistoryRow key={run.id} run={run} />)
        )}
      </section>
    </div>
  );
}
