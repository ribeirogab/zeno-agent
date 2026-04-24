import { createFileRoute } from '@tanstack/react-router';
import { EmptyState, ErrorState, Kicker } from '@zeno/ui';
import { type JSX, useMemo, useRef, useState } from 'react';
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
  component: LogsPage,
});

function LogsPage(): JSX.Element {
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

  return (
    <div className="zen-page">
      <header className="flex items-end justify-between gap-6 border-b border-border-subtle pb-6">
        <div>
          <Kicker>observability</Kicker>
          <h1 className="mt-2 font-sans text-[32px] font-medium tracking-[-0.015em] text-text-primary">
            logs
          </h1>
          <p className="mt-2.5 max-w-[640px] text-sm leading-relaxed text-text-secondary">
            Pino structured logs from the running container. Filter by level, search by event or
            correlation id, expand to see the full JSON payload.
          </p>
        </div>
        <FollowingToggle
          following={following}
          connected={streamed.connected}
          onChange={setFollowing}
        />
      </header>

      <div className="flex items-center gap-2.5">
        <LevelChips
          value={filters.level}
          onChange={(level) => setFilters((f) => ({ ...f, level }))}
        />
        <LogSearchInput value={filters.q} onChange={(q) => setFilters((f) => ({ ...f, q }))} />
        <TimeRangeSelect
          value={filters.timeRange}
          onChange={(timeRange) => setFilters((f) => ({ ...f, timeRange }))}
        />
      </div>

      <section className="flex flex-col border border-border-subtle bg-panel py-1">
        {!following && historical.isLoading && <LogListSkeleton />}
        {!following && historical.isError && (
          <ErrorState onRetry={() => void historical.refetch()} />
        )}
        {logs.length === 0 && !historical.isLoading && !historical.isError && (
          <EmptyState title="no results for current filters" />
        )}
        {logs.map((l, idx) => (
          <LogRow key={l.id} log={l} isNew={isNewArrival && idx === 0 && l.id === newestId} />
        ))}
      </section>

      <div className="flex items-center justify-between px-0.5">
        <span className="font-mono text-[10px] tracking-[0.04em] text-text-tertiary">
          {logs.length} of {logs.length} log lines · filter ·{' '}
          <span className="text-gold">{filters.level}</span>
        </span>
        <span className="font-mono text-[10px] tracking-[0.04em] text-text-tertiary">
          sse · /api/logs/stream · {following ? 'connected' : 'paused'}
        </span>
      </div>
    </div>
  );
}
