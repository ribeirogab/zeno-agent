import { createFileRoute, redirect } from '@tanstack/react-router';
import type { DotTone } from '@zeno/ui';
import cronstrue from 'cronstrue';
import type { JSX } from 'react';
import { ActivityRow } from '@/components/home/activity-row';
import { NextCronItem } from '@/components/home/next-cron-item';
import { StatTile } from '@/components/home/stat-tile';
import { DashboardTopstrip } from '@/components/layout/dashboard-topstrip';
import { HomeSkeleton } from '@/components/skeletons/home-skeleton';
import { ApiError, apiFetch } from '@/lib/api-client';
import { greetingForHour } from '@/lib/greeting';
import { homeSubtitle } from '@/lib/home-subtitle';
import { type Activity, useActivity } from '@/lib/use-activity';
import type { BackendsResponse } from '@/lib/use-backends';
import { useHealth } from '@/lib/use-health';
import { useNextCrons } from '@/lib/use-next-crons';
import { useSettings } from '@/lib/use-settings';
import { useSparkline } from '@/lib/use-sparkline';
import { useStats } from '@/lib/use-stats';

export const Route = createFileRoute('/_authed/')({
  beforeLoad: async () => {
    // Spec 0072: when no backend is configured, drop the operator into the
    // first-run onboarding hero. Throw the redirect OUTSIDE try/catch so
    // TanStack Router's Redirect signal isn't swallowed by the catch.
    let r: BackendsResponse | null = null;
    try {
      r = await apiFetch<BackendsResponse>('/api/backends');
    } catch (err) {
      // /api/backends down → render home with the existing degraded state.
      // Sidebar status dot will turn neutral; operator can still navigate.
      if (err instanceof ApiError) return;
      throw err;
    }
    const configured = r.backends.some((b) => b.status !== 'not_configured');
    if (!configured) {
      throw redirect({ to: '/onboarding/connect-backend' });
    }
  },
  component: HomeScreen,
});

// Spec 2026-05-20: derive the displayed name from the API
// (`profile.name` parsed from AGENTS.md, optional; falls back to slug).
function useDisplayName(): string {
  const settings = useSettings();
  const profile = settings.data?.profile;
  return profile?.name ?? profile?.slug ?? '…';
}

function HomeScreen(): JSX.Element {
  const stats = useStats();
  const activity = useActivity(6);
  const nextCrons = useNextCrons(3);
  const health = useHealth();
  const sparkSessions = useSparkline('sessions');
  const sparkRuns = useSparkline('runs');
  const sparkFailures = useSparkline('failures');
  const displayName = useDisplayName();

  if (stats.isLoading || activity.isLoading) {
    return (
      <>
        <DashboardTopstrip crumbs={[{ label: 'home', current: true }]} />
        <div className="max-w-[1080px] w-full mx-auto px-12 pt-10 pb-30 flex flex-col gap-10 min-w-0">
          <HomeSkeleton />
        </div>
      </>
    );
  }

  const now = new Date();
  const greeting = greetingForHour(now.getHours(), displayName);
  const subtitle = homeSubtitle({
    stats: stats.data,
    lastTickAt: health.data?.lastTickAt,
    now,
  });

  return (
    <>
      <DashboardTopstrip crumbs={[{ label: 'home', current: true }]} />
      <div className="max-w-[1080px] w-full mx-auto px-12 pt-10 pb-30 flex flex-col gap-10 min-w-0">
        <Hero
          kicker={formatDateKicker(now)}
          greeting={greeting.verb}
          name={greeting.name}
          subtitle={subtitle}
        />
        <Stats
          stats={stats.data}
          sparkSessions={sparkSessions.data}
          sparkRuns={sparkRuns.data}
          sparkFailures={sparkFailures.data}
        />
        <HomeSplit
          activity={activity.data ?? []}
          nextCrons={nextCrons.data ?? []}
          runnerStatus={health.data?.services.runner ?? 'unknown'}
          lastTickAt={health.data?.lastTickAt}
          now={now}
        />
      </div>
    </>
  );
}

// ─── Hero ──────────────────────────────────────────────────────────────────────

function Hero({
  kicker,
  greeting,
  name,
  subtitle,
}: {
  kicker: string;
  greeting: string;
  name: string;
  subtitle: string;
}): JSX.Element {
  return (
    <header className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-8 gap-y-4 items-start pt-2.5 pb-1 relative">
      <span className="col-span-full font-mono text-[11px] font-medium tracking-[0.18em] uppercase text-gold">
        {kicker}
      </span>
      <h1 className="col-start-1 font-serif text-[56px] font-normal tracking-[-0.02em] leading-[1.02] text-text-primary m-0">
        {greeting}
        <em className="italic text-gold"> {name}</em>.
      </h1>
      <div className="row-start-2 col-start-2 flex flex-col gap-1 items-end pt-[18px] font-mono text-[10px] tracking-[0.2em] text-text-tertiary uppercase whitespace-nowrap">
        <span className="text-gold">moon · waxing gibbous</span>
        <span>kernel · 6.12.3-arch1-1</span>
        <span>thread · main</span>
      </div>
      {subtitle ? (
        <p className="col-span-full font-sans text-[15px] leading-[1.6] text-text-secondary m-0 max-w-[560px]">
          {subtitle}
        </p>
      ) : null}
    </header>
  );
}

// ─── Stats grid ────────────────────────────────────────────────────────────────

function Stats({
  stats,
  sparkSessions,
  sparkRuns,
  sparkFailures,
}: {
  stats:
    | { activeCrons: number; sessions24h: number; runsToday: number; failures24h: number }
    | undefined;
  sparkSessions: number[] | undefined;
  sparkRuns: number[] | undefined;
  sparkFailures: number[] | undefined;
}): JSX.Element {
  return (
    <section className="grid grid-cols-4 gap-px bg-border-subtle border border-border-subtle">
      <StatTile
        label="active crons"
        value={stats?.activeCrons ?? 0}
        delta="+0 since yesterday"
        gold
      />
      <StatTile
        label="sessions · 24h"
        value={stats?.sessions24h ?? 0}
        delta="+3 since yesterday"
        spark={sparkSessions ?? []}
        sparkColor="var(--color-status-info)"
      />
      <StatTile
        label="runs · today"
        value={stats?.runsToday ?? 0}
        delta="avg 4.1s"
        spark={sparkRuns ?? []}
        sparkColor="var(--color-status-active)"
      />
      <StatTile
        label="failures · 24h"
        value={stats?.failures24h ?? 0}
        delta={stats?.failures24h === 0 ? '↳ 100% success' : 'review failures'}
        spark={sparkFailures ?? []}
        sparkColor="var(--color-status-failed)"
      />
    </section>
  );
}

// ─── Activity + Next split ────────────────────────────────────────────────────

interface NextCronModel {
  id: string;
  name: string;
  schedule: string;
  nextRunAt: string;
  notifyConversationId?: string;
}

function HomeSplit({
  activity,
  nextCrons,
  runnerStatus,
  lastTickAt,
  now,
}: {
  activity: Activity[];
  nextCrons: NextCronModel[];
  runnerStatus: string;
  lastTickAt: string | null | undefined;
  now: Date;
}): JSX.Element {
  return (
    <div className="grid grid-cols-[1.55fr_1fr] gap-6">
      <ActivitySection rows={activity} />
      <NextSection
        items={nextCrons}
        runnerStatus={runnerStatus}
        lastTickAt={lastTickAt}
        now={now}
      />
    </div>
  );
}

function ActivitySection({ rows }: { rows: Activity[] }): JSX.Element {
  return (
    <section className="flex flex-col gap-4 min-w-0">
      <SectionHeader label="recent activity" hint="last 6 events" />
      <div className="flex flex-col bg-panel border border-border-subtle py-1 overflow-hidden">
        {rows.length === 0 ? (
          <div className="px-5 py-4 font-mono text-xs text-text-tertiary">
            nothing here yet — activity will populate once the agent starts running.
          </div>
        ) : (
          rows.map((a) => <ActivityRow key={a.id} row={activityToRow(a)} />)
        )}
      </div>
    </section>
  );
}

function NextSection({
  items,
  runnerStatus,
  lastTickAt,
  now,
}: {
  items: NextCronModel[];
  runnerStatus: string;
  lastTickAt: string | null | undefined;
  now: Date;
}): JSX.Element {
  const tickerLabel =
    runnerStatus === 'ticking'
      ? `● ticking${lastTickAt ? ` · +${minutesAgo(new Date(`${lastTickAt}Z`), now)}m ago` : ''}`
      : `● ${runnerStatus}`;
  return (
    <section className="flex flex-col gap-4 min-w-0">
      <SectionHeader label="what's next" hint="scheduled upcoming" />
      <div className="relative border border-border-subtle bg-panel px-5 py-4.5 flex flex-col gap-3.5">
        <span
          className="absolute left-0 top-0 bottom-0 w-0.5"
          style={{
            background:
              'linear-gradient(to bottom, var(--color-gold) 0, var(--color-gold) 40px, transparent)',
          }}
        />
        {items.length === 0 ? (
          <div className="font-mono text-xs text-text-tertiary py-2">nothing scheduled.</div>
        ) : (
          items.map((item, i) => (
            <NextCronItem
              key={item.id}
              when={formatCountdown(item.nextRunAt, now)}
              name={item.name}
              meta={formatCronMeta(item.nextRunAt, item.schedule)}
              soon={i === 0}
              first={i === 0}
            />
          ))
        )}
        <div className="flex justify-between items-center gap-3 mt-2 pt-3 border-t border-dashed border-border-subtle">
          <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-text-tertiary whitespace-nowrap">
            cron runner
          </span>
          <span
            className={`font-mono text-[10px] tracking-[0.04em] whitespace-nowrap ${
              runnerStatus === 'ticking' ? 'text-status-active' : 'text-text-tertiary'
            }`}
          >
            {tickerLabel}
          </span>
        </div>
      </div>
    </section>
  );
}

// ─── Section header (shared) ──────────────────────────────────────────────────

function SectionHeader({ label, hint }: { label: string; hint: string }): JSX.Element {
  return (
    <div className="flex justify-between items-baseline gap-3 border-b border-dashed border-border-subtle pb-2.5">
      <h2 className="font-sans text-lg font-medium tracking-[-0.005em] text-text-primary m-0 whitespace-nowrap">
        {label}
      </h2>
      <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-text-tertiary whitespace-nowrap">
        {hint}
      </span>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function activityToRow(a: Activity): {
  ts: string;
  kind: string;
  summary: string;
  tone: DotTone;
} {
  const tone: DotTone =
    a.status === 'failed' ? 'failed' : a.status === 'skipped' ? 'idle' : 'active';
  const ts = new Date(a.timestamp).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  return { ts, kind: a.kind.replace('_', ' · '), summary: a.summary, tone };
}

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

function formatCronMeta(nextRunAt: string, schedule: string): string {
  const d = new Date(nextRunAt);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const dayLabel = isToday ? 'today' : 'tomorrow';
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${dayLabel} · ${time} · ${humanSchedule(schedule)}`;
}

function formatDateKicker(now: Date): string {
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long' });
  const day = now.getDate();
  const month = now.toLocaleDateString('en-US', { month: 'long' });
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${weekday} · ${day} ${month} · ${hours}:${minutes}`;
}

function minutesAgo(then: Date, now: Date): number {
  const diffMs = now.getTime() - then.getTime();
  return Math.max(0, Math.floor(diffMs / 60_000));
}
