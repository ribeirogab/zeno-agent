import { createFileRoute } from '@tanstack/react-router';
import type { JSX } from 'react';
import { ActivityRow } from '@/components/home/ActivityRow';
import { StatTile } from '@/components/home/StatTile';
import { greetingForHour } from '@/lib/greeting';
import { useActivity } from '@/lib/use-activity';
import { useStats } from '@/lib/use-stats';

export const Route = createFileRoute('/_authed/')({
  component: HomePage,
});

const USER_NAME = 'Operator';

function HomePage(): JSX.Element {
  const stats = useStats();
  const activity = useActivity();
  const now = new Date();
  const dateLabel = now
    .toLocaleDateString('pt-BR', { weekday: 'long', month: 'long', day: 'numeric' })
    .replace(/^\w/, (c) => c.toUpperCase());
  const greeting = greetingForHour(now.getHours(), USER_NAME);

  return (
    <div className="flex flex-col gap-12">
      <header className="flex flex-col gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
          {dateLabel}
        </span>
        <h1 className="font-serif text-4xl leading-tight text-text-primary">{greeting}</h1>
      </header>

      <section className="flex gap-16 border-b border-border-subtle pb-2">
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
          {activity.isLoading && <span className="text-sm text-text-secondary">carregando…</span>}
          {activity.isError && (
            <span className="text-sm text-status-failed">falhou ao carregar</span>
          )}
          {activity.data?.length === 0 && (
            <span className="text-sm text-text-secondary">nada por aqui ainda</span>
          )}
          {activity.data?.map((a) => (
            <ActivityRow key={a.id} activity={a} />
          ))}
        </div>
      </section>
    </div>
  );
}
