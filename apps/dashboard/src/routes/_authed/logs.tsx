import { createFileRoute } from '@tanstack/react-router';
import { type JSX, useMemo, useState } from 'react';
import { FollowingToggle } from '@/components/logs/following-toggle';
import { LevelChips } from '@/components/logs/level-chips';
import { LogRow } from '@/components/logs/log-row';
import { LogSearchInput } from '@/components/logs/log-search-input';
import { TimeRangeSelect } from '@/components/logs/time-range-select';
import { DEFAULT_FILTERS, type LogFilters } from '@/lib/log-filters';
import { useLogs } from '@/lib/use-logs';
import { useLogsStream } from '@/lib/use-logs-stream';

export const Route = createFileRoute('/_authed/logs')({
  component: LogsPage,
});

function LogsPage(): JSX.Element {
  const [filters, setFilters] = useState<LogFilters>(DEFAULT_FILTERS);
  const [following, setFollowing] = useState(false);

  const historical = useLogs(filters, !following);
  const streamed = useLogsStream(filters, following);

  const logs = useMemo(() => {
    if (following) return streamed.logs;
    return historical.data?.logs ?? [];
  }, [following, historical.data, streamed.logs]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:gap-6">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
            Observability
          </span>
          <h1 className="text-[22px] font-semibold tracking-tight text-text-primary">Logs</h1>
          <p className="max-w-[560px] text-sm leading-5 text-text-secondary">
            Pino JSON logs do worker + api. Filtra, busca por event ou correlationId, expande
            qualquer linha pra ver o payload inteiro.
          </p>
        </div>
        <FollowingToggle
          following={following}
          connected={streamed.connected}
          onChange={setFollowing}
        />
      </header>

      <div className="flex flex-wrap items-center gap-3 border-b border-border-subtle pb-4">
        <LevelChips
          value={filters.level}
          onChange={(level) => setFilters((f) => ({ ...f, level }))}
        />
        <div className="order-last w-full min-w-[200px] sm:order-none sm:w-auto sm:flex-1">
          <LogSearchInput value={filters.q} onChange={(q) => setFilters((f) => ({ ...f, q }))} />
        </div>
        <TimeRangeSelect
          value={filters.timeRange}
          onChange={(timeRange) => setFilters((f) => ({ ...f, timeRange }))}
        />
      </div>

      <section className="flex flex-col">
        {!following && historical.isLoading && (
          <span className="py-4 text-sm text-text-secondary">carregando…</span>
        )}
        {!following && historical.isError && (
          <span className="py-4 text-sm text-status-failed">falhou ao carregar</span>
        )}
        {logs.length === 0 && !historical.isLoading && (
          <span className="py-4 text-sm text-text-secondary">
            sem resultados nos filtros atuais
          </span>
        )}
        {logs.map((l) => (
          <LogRow key={l.id} log={l} />
        ))}
      </section>
    </div>
  );
}
