import { createFileRoute } from '@tanstack/react-router';
import { EmptyState, Kicker } from '@zeno/ui';
import { type JSX, useState } from 'react';
import { IcoSearch } from '@/components/icons';
import { SessionRow } from '@/components/sessions/session-row';
import { SessionListSkeleton } from '@/components/skeletons/session-list-skeleton';
import { type SessionApi, useSessions } from '@/lib/use-sessions';

export const Route = createFileRoute('/_authed/sessions/')({
  component: SessionsPage,
});

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
    <div className="mx-auto flex max-w-[1080px] flex-col gap-10 px-12 pt-10 pb-30">
      <header className="flex items-end justify-between gap-6 border-b border-border-subtle pb-6">
        <div>
          <Kicker>conversations</Kicker>
          <h1 className="mt-2 font-sans text-[32px] font-medium leading-tight tracking-tight text-text-primary">
            sessions
          </h1>
          <p className="mt-2.5 max-w-[620px] text-sm leading-relaxed text-text-secondary">
            Slack threads mapped to Claude SDK sessions. Each row is a continuing conversation —
            click to open the full transcript.
          </p>
        </div>
      </header>

      <div className="flex items-center gap-2.5">
        <div className="flex max-w-[420px] flex-1 items-center gap-2 border border-border-subtle bg-panel-2 px-3 py-2 focus-within:border-gold focus-within:shadow-[0_0_0_3px_var(--color-gold-ring)]">
          <span className="text-text-tertiary">
            <IcoSearch size={12} />
          </span>
          <input
            className="flex-1 bg-transparent font-mono text-xs text-text-primary outline-none placeholder:text-text-tertiary"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="channel or message content..."
          />
        </div>
        <span className="flex-1" />
        <span className="font-mono text-[10px] tracking-[0.04em] text-text-tertiary">
          {filtered.length} of {all.length} threads
        </span>
      </div>

      <div className="overflow-x-auto border border-border-subtle bg-panel">
        <div className="flex min-w-[840px] items-center gap-4 border-b border-border-subtle bg-sidebar px-5 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-text-tertiary">
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
          filtered.map((s) => <SessionRow key={s.threadId} session={s} />)
        )}
      </div>
    </div>
  );
}
