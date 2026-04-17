import { createFileRoute } from '@tanstack/react-router';
import { EmptyState, ErrorState, Skeleton } from '@zeno/ui';
import type { JSX } from 'react';
import { ActivityRow } from '@/components/home/activity-row';
import { StatTile } from '@/components/home/stat-tile';
import { HomeActivitySkeleton } from '@/components/skeletons/home-skeleton';
import { greetingForHour } from '@/lib/greeting';
import { homeSubtitle } from '@/lib/home-subtitle';
import { useActivity } from '@/lib/use-activity';
import { useHealth } from '@/lib/use-health';
import { useStats } from '@/lib/use-stats';

export const Route = createFileRoute('/_authed/')({
  component: HomePage,
});

const USER_NAME = 'Operator';

function HomePage(): JSX.Element {
  const stats = useStats();
  const health = useHealth();
  const activity = useActivity();
  const now = new Date();
  const dateLabel = now
    .toLocaleDateString('pt-BR', { weekday: 'long', month: 'long', day: 'numeric' })
    .replace(/^\w/, (c) => c.toUpperCase());
  const greeting = greetingForHour(now.getHours(), USER_NAME);
  const subtitle = homeSubtitle({
    stats: stats.data,
    lastTickAt: health.data?.lastTickAt,
    now,
  });

  return (
    <div className="flex flex-col gap-12">
      <header className="flex flex-col gap-3">
        <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
          {dateLabel}
        </span>
        <h1 className="font-serif text-3xl leading-tight text-text-primary sm:text-4xl">
          <span className="italic text-accent">{greeting.verb},</span> {greeting.name}.
        </h1>
        {subtitle ? (
          <p className="max-w-[560px] text-sm leading-5 text-text-secondary">{subtitle}</p>
        ) : (
          <Skeleton className="h-4 w-80" />
        )}
      </header>

      <section className="grid grid-cols-2 gap-6 border-b border-border-subtle pb-2 sm:gap-8 md:flex md:gap-16">
        <StatTile label="Active crons" value={stats.data?.activeCrons ?? 0} />
        <StatTile label="Sessions · 24h" value={stats.data?.sessions24h ?? 0} />
        <StatTile label="Runs · today" value={stats.data?.runsToday ?? 0} />
        <StatTile label="Failures · 24h" value={stats.data?.failures24h ?? 0} />
      </section>

      <section className="flex flex-col gap-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-text-primary">Recent activity</h2>
          <span className="text-xs text-text-secondary">last 10 events</span>
        </div>
        <div className="flex flex-col">
          {activity.isLoading ? (
            <HomeActivitySkeleton />
          ) : activity.isError ? (
            <ErrorState
              description="falhou ao carregar atividade recente."
              onRetry={() => void activity.refetch()}
            />
          ) : activity.data?.length === 0 ? (
            <EmptyState title="nada por aqui ainda" />
          ) : (
            activity.data?.map((a) => <ActivityRow key={a.id} activity={a} />)
          )}
        </div>
      </section>
    </div>
  );
}
