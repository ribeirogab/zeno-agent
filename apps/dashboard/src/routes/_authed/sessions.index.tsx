import { createFileRoute } from '@tanstack/react-router';
import { type JSX, useState } from 'react';
import { DashboardTopstrip } from '@/components/layout/dashboard-topstrip';
import {
  SessionRow,
  type SessionTableRow,
  sessionToTableRow,
} from '@/components/sessions/session-row';
import { SessionsTableSkeleton } from '@/components/skeletons/sessions-table-skeleton';
import { useSessions } from '@/lib/use-sessions';

export const Route = createFileRoute('/_authed/sessions/')({
  component: SessionsListScreen,
});

function SessionsListScreen(): JSX.Element {
  const sessions = useSessions();
  const [query, setQuery] = useState('');

  const allRows: SessionTableRow[] = (sessions.data ?? []).map(sessionToTableRow);
  const filtered = filterRows(allRows, query);

  return (
    <>
      <DashboardTopstrip crumbs={[{ label: 'sessions', current: true }]} />
      <div className="max-w-[1080px] w-full mx-auto px-12 pt-10 pb-30 flex flex-col gap-10 min-w-0">
        <Header />
        <FilterRow
          total={allRows.length}
          shown={filtered.length}
          loading={sessions.isLoading}
          query={query}
          onQuery={setQuery}
        />
        {sessions.isLoading || !sessions.data ? (
          <SessionsTableSkeleton />
        ) : allRows.length === 0 ? (
          <SessionsEmpty />
        ) : filtered.length === 0 ? (
          <NoMatch query={query} onClear={() => setQuery('')} />
        ) : (
          <Table rows={filtered} />
        )}
      </div>
    </>
  );
}

function filterRows(rows: SessionTableRow[], query: string): SessionTableRow[] {
  if (query.trim() === '') return rows;
  const q = query.toLowerCase();
  return rows.filter(
    (r) =>
      r.channel.toLowerCase().includes(q) ||
      r.lastMessage.toLowerCase().includes(q) ||
      r.sessionId.toLowerCase().includes(q),
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────

function Header(): JSX.Element {
  return (
    <header className="flex items-end justify-between gap-6 border-b border-border-subtle pb-6">
      <div className="flex flex-col">
        <span className="font-mono text-[11px] font-medium tracking-[0.18em] leading-[14px] uppercase text-gold">
          conversations
        </span>
        <h1 className="font-sans text-[32px] font-medium tracking-[-0.015em] leading-10 text-text-primary mt-2 m-0">
          sessions
        </h1>
        <p className="font-sans text-sm leading-[1.6] text-text-secondary mt-2.5 m-0 max-w-[620px]">
          Slack threads mapped to Claude SDK sessions. Each row is a continuing conversation — click
          to open the full transcript.
        </p>
      </div>
    </header>
  );
}

// ─── Filter row ───────────────────────────────────────────────────────────────

function FilterRow({
  total,
  shown,
  loading,
  query,
  onQuery,
}: {
  total: number;
  shown: number;
  loading: boolean;
  query: string;
  onQuery: (q: string) => void;
}): JSX.Element {
  return (
    <div className="flex items-center gap-2.5">
      <label
        htmlFor="sessions-search"
        className="flex items-center gap-2 bg-panel-2 border border-border-subtle focus-within:border-gold focus-within:shadow-[0_0_0_3px_rgba(217,179,98,0.28)] transition-[border-color,box-shadow] duration-[120ms] px-3 py-2 flex-1 max-w-[420px]"
      >
        <SearchIcon />
        <input
          id="sessions-search"
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="channel or message content…"
          className="flex-1 bg-transparent border-0 outline-0 font-mono text-xs leading-4 text-text-primary placeholder:text-text-tertiary"
        />
      </label>
      <span className="flex-1" />
      <span className="font-mono text-[10px] tracking-[0.04em] leading-3 text-text-tertiary">
        {loading ? 'loading…' : `${shown} of ${total} threads`}
      </span>
    </div>
  );
}

function SearchIcon(): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-text-tertiary"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </svg>
  );
}

// ─── Table + empty/no-match ──────────────────────────────────────────────────

function Table({ rows }: { rows: SessionTableRow[] }): JSX.Element {
  return (
    <div className="bg-panel border border-border-subtle flex flex-col min-w-0 overflow-x-auto">
      <Thead />
      {rows.map((row, i) => (
        <SessionRow key={row.threadId} row={row} last={i === rows.length - 1} />
      ))}
    </div>
  );
}

function Thead(): JSX.Element {
  return (
    <div className="flex items-center gap-4 px-5 py-3 border-b border-border-subtle bg-sidebar font-mono text-[10px] tracking-[0.18em] leading-3 uppercase text-text-tertiary min-w-[840px]">
      <span className="flex-1 min-w-0">channel · thread</span>
      <span className="w-[280px] shrink-0">last user message</span>
      <span className="w-[120px] shrink-0">last activity</span>
      <span className="w-[70px] shrink-0">msgs</span>
      <span className="w-[128px] shrink-0">backend</span>
    </div>
  );
}

function SessionsEmpty(): JSX.Element {
  return (
    <div className="bg-panel border border-border-subtle px-10 py-16 flex flex-col items-center text-center gap-4">
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20">
        <path d="M10 0 L20 10 L10 20 L0 10 Z" stroke="#D9B362" fill="none" strokeWidth="1.5" />
      </svg>
      <h3 className="m-0 font-serif text-2xl tracking-[-0.02em] leading-7 text-text-primary">
        No threads yet.
      </h3>
      <p className="m-0 max-w-[480px] font-sans text-[13px] leading-[1.6] text-text-secondary">
        Mention <span className="font-mono text-gold">@zeno</span> in any channel or DM to start a
        conversation. Each Slack thread becomes a Claude SDK session — they'll show up here as soon
        as the first message arrives.
      </p>
      <div className="flex items-center gap-2 mt-2 px-3.5 py-2 bg-canvas border border-border-subtle">
        <span className="w-1.5 h-1.5 rounded-full bg-status-active" />
        <span className="font-mono text-[11px] tracking-[0.04em] leading-[14px] text-text-secondary">
          slack listener · ready · waiting for first event
        </span>
      </div>
    </div>
  );
}

function NoMatch({ query, onClear }: { query: string; onClear: () => void }): JSX.Element {
  return (
    <div className="bg-panel border border-border-subtle px-10 py-12 flex flex-col items-center text-center gap-3">
      <h3 className="m-0 font-serif text-xl tracking-[-0.02em] leading-6 text-text-primary">
        No threads match "<span className="text-gold">{query}</span>".
      </h3>
      <p className="m-0 max-w-[420px] font-sans text-[13px] leading-[1.6] text-text-secondary">
        Try a shorter query or a different channel name.
      </p>
      <button
        type="button"
        onClick={onClear}
        className="mt-2 inline-flex items-center px-3.5 py-2 border border-border-subtle font-mono text-[10px] tracking-[0.12em] leading-3 uppercase text-text-secondary hover:text-text-primary hover:border-border-strong transition-colors duration-[120ms]"
      >
        clear search
      </button>
    </div>
  );
}
