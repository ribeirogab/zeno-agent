import { useEffect, useRef, useState } from 'react';
import { filtersToQueryString, type LogApi, type LogFilters } from '@/lib/log-filters';

const MAX_IN_MEMORY = 500;

export function useLogsStream(
  filters: LogFilters,
  enabled: boolean,
): {
  logs: LogApi[];
  connected: boolean;
} {
  const [logs, setLogs] = useState<LogApi[]>([]);
  const [connected, setConnected] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled) {
      sourceRef.current?.close();
      sourceRef.current = null;
      setConnected(false);
      return;
    }
    const qs = filtersToQueryString(filters);
    const source = new EventSource(`/api/logs/stream?${qs}`, { withCredentials: true });
    sourceRef.current = source;
    source.onopen = (): void => setConnected(true);
    source.onerror = (): void => setConnected(false);
    source.onmessage = (event): void => {
      try {
        const parsed = JSON.parse(event.data) as LogApi;
        setLogs((prev) => {
          const next = [parsed, ...prev];
          return next.length > MAX_IN_MEMORY ? next.slice(0, MAX_IN_MEMORY) : next;
        });
      } catch {
        // ignore malformed events; heartbeat pings have event type not 'message'
      }
    };
    return (): void => {
      source.close();
      if (sourceRef.current === source) sourceRef.current = null;
      setConnected(false);
    };
  }, [enabled, filters]);

  return { logs, connected };
}
