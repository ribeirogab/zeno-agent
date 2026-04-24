import { createFileRoute } from '@tanstack/react-router';
import { Dot, EmptyState, ErrorState, Kicker, Skeleton } from '@zeno/ui';
import cronstrue from 'cronstrue';
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

function humanSchedule(cron: string): string {
  try {
    const raw = cronstrue.toString(cron, { use24HourTimeFormat: true });
    return raw
      .replace(/^At /, '')
      .replace(/ hours?/gi, 'h')
      .replace(/ minutes?/gi, 'm')
      .replace(/ seconds?/gi, 's')
      .replace(/Every /gi, 'every ')
      .toLowerCase();
  } catch {
    return cron;
  }
}

function formatCronMeta(nextRunAt: string, schedule: string, channel?: string): string {
  const d = new Date(nextRunAt);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const dayLabel = isToday ? 'today' : 'tomorrow';
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const scheduleLabel = channel ? `#${channel}` : humanSchedule(schedule);
  return `${dayLabel} · ${time} · ${scheduleLabel}`;
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
      className="inline-block animate-[word-rise_0.52s_cubic-bezier(0.2,0.8,0.2,1)_both]"
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
    <div className="zen-page">
      <header className="zen-home-hero">
        <Kicker>{formatDateKicker(now)}</Kicker>
        <h1 className="zen-display">
          <WordRise text={greeting.verb} delay={0} />
          <em
            className="inline-block animate-[word-rise_0.52s_cubic-bezier(0.2,0.8,0.2,1)_both]"
            style={{ animationDelay: '140ms' }}
          >
            {greeting.name}
          </em>
          <WordRise text="." delay={260} />
        </h1>
        {subtitle ? (
          <p className="zen-body" style={{ maxWidth: 560, fontSize: 15 }}>
            {subtitle}
          </p>
        ) : (
          <Skeleton className="h-4 w-80" />
        )}
        <div className="zen-hero-ornament">
          <span className="phase">moon · waxing gibbous</span>
          <span>kernel · 6.12.3-arch1-1</span>
          <span>thread · main</span>
        </div>
      </header>

      <section className="zen-stats">
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

      <div className="zen-home-split">
        <section className="zen-section">
          <div className="zen-section-hd">
            <h2 className="zen-h2">recent activity</h2>
            <span className="zen-kicker-mute">last 6 events</span>
          </div>
          <div className="zen-activity-list">
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

        <section className="zen-section">
          <div className="zen-section-hd">
            <h2 className="zen-h2">what&apos;s next</h2>
            <span className="zen-kicker-mute">scheduled upcoming</span>
          </div>
          <div className="zen-next-panel">
            {nextCrons.data?.map((cron, index) => (
              <NextCronItem
                key={cron.id}
                countdown={formatCountdown(cron.nextRunAt, now)}
                name={cron.name}
                meta={formatCronMeta(cron.nextRunAt, cron.schedule)}
                highlight={index === 0}
              />
            ))}
            <div className="zen-next-footer">
              <span className="zen-kicker-mute">cron runner</span>
              <span className="zen-mono-sm" style={{ color: 'var(--color-status-active)' }}>
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
