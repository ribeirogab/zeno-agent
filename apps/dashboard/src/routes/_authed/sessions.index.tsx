import { createFileRoute, Link } from '@tanstack/react-router';
import { Dot, EmptyState, Kicker } from '@zeno/ui';
import { type JSX, useState } from 'react';
import { IcoSearch } from '@/components/icons';
import { SessionListSkeleton } from '@/components/skeletons/session-list-skeleton';
import { type SessionApi, useSessions } from '@/lib/use-sessions';

export const Route = createFileRoute('/_authed/sessions/')({
  component: SessionsPage,
});

function relativeFrom(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const day = days[d.getDay()];
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${day} · ${h}:${m}`;
}

function matchesQuery(session: SessionApi, query: string): boolean {
  if (!query) return true;
  const lower = query.toLowerCase();
  return (
    session.threadId.toLowerCase().includes(lower) ||
    session.sessionId.toLowerCase().includes(lower)
  );
}

function SessionsPage(): JSX.Element {
  const q = useSessions();
  const [search, setSearch] = useState('');

  const all = q.data ?? [];
  const filtered = all.filter((s) => matchesQuery(s, search));

  return (
    <div className="mx-auto flex max-w-[1080px] flex-col gap-10 px-12 py-10">
      <header className="flex flex-col gap-2">
        <Kicker>conversations</Kicker>
        <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-text-primary">
          sessions
        </h1>
        <p className="mt-1 max-w-[620px] text-sm leading-5 text-text-secondary">
          Slack threads mapped to Claude SDK sessions. Each row is a continuing conversation — click
          to open the full transcript.
        </p>
      </header>

      <div className="flex items-center gap-4">
        <div className="flex max-w-[420px] flex-1 items-center gap-2 border border-border-subtle bg-panel-2 px-3 py-2">
          <span className="text-text-tertiary">
            <IcoSearch size={12} />
          </span>
          <input
            className="flex-1 bg-transparent font-mono text-xs text-text-primary outline-none placeholder:text-text-tertiary focus:ring-0"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="channel or message content..."
          />
        </div>
        <span className="flex-1" />
        <span className="font-mono text-[11px] text-text-tertiary">
          {filtered.length} of {all.length} threads
        </span>
      </div>

      <section className="flex flex-col">
        <div className="flex items-center border-b border-border-subtle py-3 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
          <span className="flex-1">channel · thread</span>
          <span className="w-[280px] shrink-0">last user message</span>
          <span className="w-[120px] shrink-0">last activity</span>
          <span className="w-[70px] shrink-0">msgs</span>
          <span className="w-[128px] shrink-0">backend</span>
        </div>
        {q.isLoading ? (
          <SessionListSkeleton />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="no sessions yet"
            description="chat with Zeno on Slack to get started."
          />
        ) : (
          filtered.map((s) => (
            <Link
              key={s.threadId}
              to="/sessions/$threadId"
              params={{ threadId: s.threadId }}
              className="flex items-center border-b border-panel py-4 hover:bg-panel/40"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate text-sm font-medium text-text-primary">{s.threadId}</span>
                <span className="font-mono text-[11px] text-text-tertiary">
                  session · {s.sessionId}
                </span>
              </div>
              <span className="w-[280px] shrink-0 truncate text-sm text-text-secondary" />
              <div className="flex w-[120px] shrink-0 flex-col gap-0.5">
                <span className="text-xs text-text-secondary">{relativeFrom(s.lastUsedAt)}</span>
                <span className="font-mono text-[11px] text-text-tertiary">
                  {formatDate(s.lastUsedAt)}
                </span>
              </div>
              <span className="w-[70px] shrink-0 font-mono text-xs text-gold" />
              <span className="flex w-[128px] shrink-0 items-center gap-1.5">
                <Dot tone="active" />
                <span className="font-mono text-[11px] text-text-secondary">claude-code</span>
              </span>
            </Link>
          ))
        )}
      </section>
    </div>
  );
}
