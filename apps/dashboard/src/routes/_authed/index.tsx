import { createFileRoute } from '@tanstack/react-router';
import { Dot, EmptyState, ErrorState, Kicker, Skeleton } from '@zeno/ui';
import type { JSX } from 'react';
import { ActivityRow } from '@/components/home/activity-row';
import { NextCronItem } from '@/components/home/next-cron-item';
import { StatTile } from '@/components/home/stat-tile';
import { HomeActivitySkeleton } from '@/components/skeletons/home-skeleton';
import { greetingForHour } from '@/lib/greeting';
import { homeSubtitle, relativeTime } from '@/lib/home-subtitle';
import { useActivity } from '@/lib/use-activity';
import { useHealth } from '@/lib/use-health';
import { useNextCrons } from '@/lib/use-next-crons';
import { useSparkline } from '@/lib/use-sparkline';
import { useStats } from '@/lib/use-stats';

export const Route = createFileRoute('/_authed/')({
  component: HomePage,
});

const USER_NAME = 'Operator';

function formatCountdown(nextRunAt: string, now: Date): string {
  const diff = new Date(nextRunAt).getTime() - now.getTime();
  if (diff <= 0) return 'now';
  const totalMinutes = Math.floor(diff / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `in ${hours}h ${minutes}m`;
  return `in ${minutes}m`;
}

function formatCronMeta(nextRunAt: string, schedule: string): string {
  const d = new Date(nextRunAt);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const dayLabel = isToday ? 'today' : 'tomorrow';
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${dayLabel} · ${time} · ${schedule}`;
}

function formatDateKicker(now: Date): string {
  const weekday = now.toLocaleDateString('pt-BR', { weekday: 'long' });
  const day = now.getDate();
  const month = now.toLocaleDateString('pt-BR', { month: 'long' });
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${weekday} · ${day} ${month} · ${hours}:${minutes}`;
}

function WordRise({ text, delay }: { text: string; delay: number }): JSX.Element {
  return (
    <span
      className="inline-block animate-[word-rise_0.5s_ease-out_both]"
      style={{ animationDelay: `${delay}ms` }}
    >
      {text}
    </span>
  );
}

function HomePage(): JSX.Element {
  const stats = useStats();
  const health = useHealth();
  const activity = useActivity(6);
  const sparkSessions = useSparkline('sessions');
  const sparkRuns = useSparkline('runs');
  const sparkFailures = useSparkline('failures');
  const nextCrons = useNextCrons(3);
  const now = new Date();
  const greeting = greetingForHour(now.getHours(), USER_NAME);
  const subtitle = homeSubtitle({
    stats: stats.data,
    lastTickAt: health.data?.lastTickAt,
    now,
  });

  const lastTickLabel = health.data?.lastTickAt
    ? `+${relativeTime(new Date(`${health.data.lastTickAt}Z`), now).replace(' ago', '')}`
    : '';

  const runnerStatus = health.data?.services.runner ?? 'unknown';

  return (
    <div className="flex flex-col gap-12">
      <header className="relative flex flex-col gap-3">
        <Kicker>{formatDateKicker(now)}</Kicker>
        <h1 className="font-serif text-[56px] leading-[1.05] text-text-primary">
          <WordRise text={greeting.verb} delay={0} />{' '}
          <em
            className="inline-block animate-[word-rise_0.5s_ease-out_both] text-gold"
            style={{ animationDelay: '140ms' }}
          >
            {greeting.name}
          </em>
          <WordRise text="." delay={260} />
        </h1>
        {subtitle ? (
          <p className="max-w-[560px] text-[15px] leading-relaxed text-text-secondary">
            {subtitle}
          </p>
        ) : (
          <Skeleton className="h-4 w-80" />
        )}
        <div className="absolute top-0 right-0 flex flex-col items-end gap-1 font-mono text-[10px] text-text-tertiary">
          <span>moon · waxing gibbous</span>
          <span>kernel · 6.12.3-arch1-1</span>
          <span>thread · main</span>
        </div>
      </header>

      <section className="grid grid-cols-4 gap-px overflow-hidden rounded border border-border-subtle bg-border-subtle">
        <StatTile
          label="active crons"
          value={stats.data?.activeCrons ?? 0}
          variant="gold"
          delta="+0 since yesterday"
        />
        <StatTile
          label="sessions · 24h"
          value={stats.data?.sessions24h ?? 0}
          delta="+3 since yesterday"
          spark={sparkSessions.data ?? []}
          sparkColor="var(--color-status-info)"
        />
        <StatTile
          label="runs · today"
          value={stats.data?.runsToday ?? 0}
          delta="avg 4.1s"
          spark={sparkRuns.data ?? []}
          sparkColor="var(--color-status-active)"
        />
        <StatTile
          label="failures · 24h"
          value={stats.data?.failures24h ?? 0}
          delta="↳ 100% success"
          spark={sparkFailures.data ?? []}
          sparkColor="var(--color-status-failed)"
        />
      </section>

      <div className="grid grid-cols-[1.55fr_1fr] gap-6">
        <section className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between">
            <h2 className="font-serif text-lg text-text-primary">recent activity</h2>
            <Kicker mute>last 6 events</Kicker>
          </div>
          <div className="overflow-hidden rounded border border-border-subtle bg-panel">
            {activity.isLoading ? (
              <HomeActivitySkeleton />
            ) : activity.isError ? (
              <ErrorState
                description="failed to load recent activity."
                onRetry={() => void activity.refetch()}
              />
            ) : activity.data?.length === 0 ? (
              <EmptyState title="nothing here yet" />
            ) : (
              activity.data?.map((a) => <ActivityRow key={a.id} activity={a} />)
            )}
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between">
            <h2 className="font-serif text-lg text-text-primary">what&apos;s next</h2>
            <Kicker mute>scheduled upcoming</Kicker>
          </div>
          <div className="overflow-hidden rounded border border-border-subtle border-l-2 border-l-gold bg-panel px-5 py-3">
            {nextCrons.data?.map((cron, index) => (
              <NextCronItem
                key={cron.id}
                countdown={formatCountdown(cron.nextRunAt, now)}
                name={cron.name}
                meta={formatCronMeta(cron.nextRunAt, cron.schedule)}
                highlight={index === 0}
              />
            ))}
            <div className="mt-2 flex items-center justify-between border-t border-dashed border-border-subtle pt-3">
              <Kicker mute>cron runner</Kicker>
              <span className="font-mono text-[11px] text-status-active">
                <Dot tone={runnerStatus === 'ticking' ? 'active' : 'idle'} className="mr-1.5" />
                {runnerStatus === 'ticking' ? 'ticking' : runnerStatus}
                {lastTickLabel ? ` · ${lastTickLabel} ago` : ''}
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
