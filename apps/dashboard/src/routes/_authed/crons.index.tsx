import { createFileRoute, Link } from '@tanstack/react-router';
import { Button, EmptyState, Kicker } from '@zeno/ui';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { CronRow } from '@/components/crons/cron-row';
import { IcoPlus } from '@/components/icons';
import { CronListSkeleton } from '@/components/skeletons/cron-list-skeleton';
import { useCrons } from '@/lib/use-crons';
import { useHealth } from '@/lib/use-health';

export const Route = createFileRoute('/_authed/crons/')({
  component: CronsPage,
});

const TICK_INTERVAL_S = 60;

function useNextTickCountdown(lastTickAt: string | null | undefined): string {
  const [label, setLabel] = useState('');

  useEffect(() => {
    if (!lastTickAt) {
      setLabel('');
      return;
    }

    function compute() {
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

function CronsPage(): JSX.Element {
  const crons = useCrons();
  const health = useHealth();

  const activeCount = crons.data?.filter((c) => c.enabled).length ?? 0;
  const pausedCount = crons.data?.filter((c) => !c.enabled).length ?? 0;
  const failingCount = 0;
  const totalCount = crons.data?.length ?? 0;
  const nextTickLabel = useNextTickCountdown(health.data?.lastTickAt);

  return (
    <div className="zen-page">
      <header className="flex items-end justify-between gap-6 border-b border-border-subtle pb-6">
        <div>
          <Kicker>scheduled tasks</Kicker>
          <h1 className="mt-2 font-sans text-[32px] font-medium leading-tight tracking-[-0.015em] text-text-primary">
            crons
          </h1>
          <p className="mt-2.5 max-w-[620px] text-sm leading-relaxed text-text-secondary">
            Recurring tasks.{' '}
            <span className="border border-border-subtle bg-panel-2 px-1.5 py-px font-mono text-xs text-gold">
              static
            </span>{' '}
            lives in{' '}
            <span className="border border-border-subtle bg-panel-2 px-1.5 py-px font-mono text-xs text-gold">
              profile/crons.yaml
            </span>
            ;{' '}
            <span className="border border-border-subtle bg-panel-2 px-1.5 py-px font-mono text-xs text-gold">
              chat
            </span>{' '}
            crons came from Slack.
          </p>
        </div>
        <Link to="/crons/new" className="shrink-0">
          <Button variant="outline">
            <IcoPlus size={13} />
            new cron
          </Button>
        </Link>
      </header>

      <div className="overflow-x-auto border border-border-subtle bg-panel">
        <div className="flex min-w-[840px] items-center gap-4 border-b border-border-subtle bg-sidebar px-5 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-text-tertiary">
          <span className="flex-1">name</span>
          <span className="w-40 shrink-0">schedule</span>
          <span className="w-[140px] shrink-0">next run</span>
          <span className="w-[90px] shrink-0">source</span>
          <span className="w-[108px] shrink-0">status</span>
          <span className="w-[150px] shrink-0 text-right">actions</span>
        </div>

        {crons.isLoading ? (
          <CronListSkeleton />
        ) : crons.data?.length === 0 ? (
          <EmptyState
            title="no crons yet"
            description="create your first schedule to automate Zeno."
            action={
              <Link to="/crons/new">
                <Button variant="primary" size="sm">
                  new cron
                </Button>
              </Link>
            }
          />
        ) : (
          crons.data?.map((cron) => <CronRow key={cron.id} cron={cron} />)
        )}
      </div>

      {crons.data && crons.data.length > 0 && (
        <div className="flex justify-between px-0.5">
          <span className="font-mono text-[10px] tracking-[0.04em] text-text-tertiary">
            {totalCount} crons · {activeCount} active · {pausedCount} paused · {failingCount}{' '}
            failing
          </span>
          <span className="font-mono text-[10px] tracking-[0.04em] text-text-tertiary">
            runner · ticking{nextTickLabel ? ` · ${nextTickLabel}` : ''}
          </span>
        </div>
      )}
    </div>
  );
}
