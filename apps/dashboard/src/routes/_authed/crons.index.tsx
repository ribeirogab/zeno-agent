import { createFileRoute, Link } from '@tanstack/react-router';
import { Button } from '@zeno/ui';
import type { JSX } from 'react';
import { CronRow } from '@/components/crons/cron-row';
import { useCrons } from '@/lib/use-crons';

export const Route = createFileRoute('/_authed/crons/')({
  component: CronsPage,
});

function CronsPage(): JSX.Element {
  const crons = useCrons();
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-start sm:gap-8">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
            Scheduled tasks
          </span>
          <h1 className="text-[22px] font-semibold tracking-tight text-text-primary">Crons</h1>
          <p className="max-w-[560px] text-sm leading-5 text-text-secondary">
            Recurring tasks. Static lives in <span className="font-mono">profile/crons.yaml</span>
            {' · '}chat-source crons came from Slack or the dashboard.
          </p>
        </div>
        <Link to="/crons/new" className="shrink-0">
          <Button variant="outline">+ New cron</Button>
        </Link>
      </header>

      <section className="flex flex-col">
        <div className="flex items-center gap-4 border-b border-border-subtle py-3 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
          <span className="flex-1">Name</span>
          <span className="hidden w-40 shrink-0 sm:inline">Schedule</span>
          <span className="hidden w-24 shrink-0 md:inline">Source</span>
          <span className="w-20 shrink-0 text-right sm:w-24 sm:text-left">Status</span>
        </div>
        {crons.isLoading && <span className="py-4 text-sm text-text-secondary">carregando…</span>}
        {crons.data?.length === 0 && (
          <span className="py-4 text-sm text-text-secondary">nenhum cron ainda</span>
        )}
        {crons.data?.map((cron) => (
          <CronRow key={cron.id} cron={cron} />
        ))}
      </section>
    </div>
  );
}
