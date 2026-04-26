import { createFileRoute } from '@tanstack/react-router';
import { ErrorState } from '@zeno/ui';
import { type JSX, useMemo, useRef, useState } from 'react';
import { DashboardTopstrip } from '@/components/layout/dashboard-topstrip';
import { FollowingToggle } from '@/components/logs/following-toggle';
import { LevelChips } from '@/components/logs/level-chips';
import { LogRow } from '@/components/logs/log-row';
import { LogSearchInput } from '@/components/logs/log-search-input';
import { TimeRangeSelect } from '@/components/logs/time-range-select';
import { LogListSkeleton } from '@/components/skeletons/log-list-skeleton';
import { DEFAULT_FILTERS, type LogFilters } from '@/lib/log-filters';
import { useLogs } from '@/lib/use-logs';
import { useLogsStream } from '@/lib/use-logs-stream';

export const Route = createFileRoute('/_authed/logs')({
  component: LogsScreen,
});

function LogsScreen(): JSX.Element {
  const [filters, setFilters] = useState<LogFilters>(DEFAULT_FILTERS);
  const [following, setFollowing] = useState(false);
  const prevCountRef = useRef(0);

  const historical = useLogs(filters, !following);
  const streamed = useLogsStream(filters, following);

  const logs = useMemo(() => {
    if (following) return streamed.logs;
    return historical.data?.logs ?? [];
  }, [following, historical.data, streamed.logs]);

  const newestId = logs[0]?.id;
  const isNewArrival = following && logs.length > prevCountRef.current;
  if (logs.length !== prevCountRef.current) {
    prevCountRef.current = logs.length;
  }

  const totalCount = logs.length;

  return (
    <>
      <DashboardTopstrip crumbs={[{ label: 'logs', current: true }]} />
      <div className="max-w-[1080px] w-full mx-auto px-12 pt-10 pb-30 flex flex-col gap-6 min-w-0">
        <Header following={following} connected={streamed.connected} onFollowing={setFollowing} />
        <FilterRow filters={filters} onChange={setFilters} />
        {following ? null : historical.isLoading ? <LogListSkeleton /> : null}
        {following ? null : historical.isError ? (
          <ErrorState
            title="failed to load logs"
            description="check the api connection."
            onRetry={() => void historical.refetch()}
          />
        ) : null}
        {!following && historical.isLoading ? null : !following && historical.isError ? null : (
          <LogList
            logs={logs}
            newestId={newestId}
            isNewArrival={isNewArrival}
            onClearFilters={() => setFilters(DEFAULT_FILTERS)}
            onExpand24h={() => setFilters((f) => ({ ...f, timeRange: '24h' }))}
          />
        )}
        <FooterStats
          shown={totalCount}
          total={totalCount}
          level={filters.level}
          loading={!following && historical.isLoading}
          following={following}
          connected={streamed.connected}
        />
      </div>
    </>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────

function Header({
  following,
  connected,
  onFollowing,
}: {
  following: boolean;
  connected: boolean;
  onFollowing: (v: boolean) => void;
}): JSX.Element {
  return (
    <header className="flex items-end justify-between gap-6 border-b border-border-subtle pb-6">
      <div className="flex flex-col flex-1">
        <span className="font-mono text-[11px] font-medium tracking-[0.18em] leading-[14px] uppercase text-gold">
          observability
        </span>
        <h1 className="font-sans text-[32px] font-medium tracking-[-0.015em] leading-10 text-text-primary mt-2 m-0">
          logs
        </h1>
        <p className="font-sans text-sm leading-[1.6] text-text-secondary mt-2.5 m-0 max-w-[640px]">
          Pino structured logs from the running container. Filter by level, search by event or
          correlation id, expand to see the full JSON payload.
        </p>
      </div>
      <FollowingToggle following={following} connected={connected} onChange={onFollowing} />
    </header>
  );
}

// ─── Filter row ───────────────────────────────────────────────────────────────

function FilterRow({
  filters,
  onChange,
}: {
  filters: LogFilters;
  onChange: (next: LogFilters | ((prev: LogFilters) => LogFilters)) => void;
}): JSX.Element {
  return (
    <div className="flex items-center gap-2.5">
      <LevelChips value={filters.level} onChange={(level) => onChange((f) => ({ ...f, level }))} />
      <LogSearchInput value={filters.q} onChange={(q) => onChange((f) => ({ ...f, q }))} />
      <TimeRangeSelect
        value={filters.timeRange}
        onChange={(timeRange) => onChange((f) => ({ ...f, timeRange }))}
      />
    </div>
  );
}

// ─── Log list + empty branch ─────────────────────────────────────────────────

function LogList({
  logs,
  newestId,
  isNewArrival,
  onClearFilters,
  onExpand24h,
}: {
  logs: ReturnType<typeof useLogsStream>['logs'];
  newestId: number | undefined;
  isNewArrival: boolean;
  onClearFilters: () => void;
  onExpand24h: () => void;
}): JSX.Element {
  if (logs.length === 0) {
    return (
      <div className="bg-panel border border-border-subtle px-10 py-16 flex flex-col items-center text-center gap-4">
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20">
          <path d="M10 0 L20 10 L10 20 L0 10 Z" stroke="#D9B362" fill="none" strokeWidth="1.5" />
        </svg>
        <h3 className="m-0 font-serif text-2xl tracking-[-0.02em] leading-7 text-text-primary">
          No log entries in this range.
        </h3>
        <p className="m-0 max-w-[480px] font-sans text-[13px] leading-[1.6] text-text-secondary">
          Either the worker hasn't fired anything yet, or your filter caught nothing. Widen the
          range, drop the level filter, or stay here — new entries stream in automatically while{' '}
          <span className="font-mono text-gold">following</span> is on.
        </p>
        <div className="flex gap-2 mt-2">
          <button
            type="button"
            onClick={onExpand24h}
            className="inline-flex items-center px-3.5 py-2 bg-gold-soft border border-gold-line font-mono text-[10px] tracking-[0.12em] leading-3 uppercase text-gold hover:bg-gold/15 hover:border-gold transition-colors duration-[120ms]"
          >
            expand to 24h
          </button>
          <button
            type="button"
            onClick={onClearFilters}
            className="inline-flex items-center px-3.5 py-2 border border-border-subtle font-mono text-[10px] tracking-[0.12em] leading-3 uppercase text-text-secondary hover:text-text-primary hover:border-border-strong transition-colors duration-[120ms]"
          >
            clear filters
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-panel border border-border-subtle py-1 flex flex-col overflow-x-auto min-w-0">
      {logs.map((log, idx) => (
        <LogRow key={log.id} log={log} isNew={isNewArrival && idx === 0 && log.id === newestId} />
      ))}
    </div>
  );
}

// ─── Footer ──────────────────────────────────────────────────────────────────

function FooterStats({
  total,
  shown,
  level,
  loading,
  following,
  connected,
}: {
  total: number;
  shown: number;
  level: LogFilters['level'];
  loading: boolean;
  following: boolean;
  connected: boolean;
}): JSX.Element {
  const sseLabel = following ? (connected ? 'connected' : 'connecting…') : 'paused';
  return (
    <div className="flex justify-between gap-3 px-0.5 font-mono text-[10px] tracking-[0.04em] leading-3 text-text-tertiary">
      <span>{loading ? 'loading…' : `${shown} of ${total} log lines · filter · ${level}`}</span>
      <span>sse · /api/logs/stream · {sseLabel}</span>
    </div>
  );
}
