import { createFileRoute } from '@tanstack/react-router';
import { ErrorState } from '@zeno/ui';
import type { JSX } from 'react';
import { DashboardTopstrip } from '@/components/layout/dashboard-topstrip';
import { MessageBlock } from '@/components/sessions/message-block';
import { SessionTranscriptSkeleton } from '@/components/skeletons/session-transcript-skeleton';
import { type SessionMessageApi, useSession } from '@/lib/use-session';

export const Route = createFileRoute('/_authed/sessions/$threadId')({
  component: SessionDetailScreen,
});

function relativeFrom(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function SessionDetailScreen(): JSX.Element {
  const { threadId } = Route.useParams();
  const q = useSession(threadId);

  if (q.isLoading) {
    return (
      <>
        <DashboardTopstrip
          crumbs={[
            { label: 'sessions', to: '/sessions' },
            { label: '…', current: true },
          ]}
        />
        <div className="max-w-[1080px] w-full mx-auto px-12 pt-10 pb-30 flex flex-col gap-6 min-w-0">
          <SessionTranscriptSkeleton />
        </div>
      </>
    );
  }

  if (q.isError || !q.data) {
    return (
      <>
        <DashboardTopstrip
          crumbs={[
            { label: 'sessions', to: '/sessions' },
            { label: '…', current: true },
          ]}
        />
        <div className="max-w-[1080px] w-full mx-auto px-12 pt-10 pb-30 flex flex-col gap-6 min-w-0">
          <ErrorState
            title="session not found"
            description="this thread could not be loaded."
            onRetry={() => void q.refetch()}
          />
        </div>
      </>
    );
  }

  const { session, messages } = q.data;

  return (
    <>
      <DashboardTopstrip
        crumbs={[
          { label: 'sessions', to: '/sessions' },
          { label: session.sessionId, current: true },
        ]}
      />
      <div className="max-w-[1080px] w-full mx-auto px-12 pt-10 pb-30 flex flex-col gap-6 min-w-0">
        <Header
          threadId={session.threadId}
          sessionId={session.sessionId}
          msgCount={messages.length}
          lastUsedAt={session.lastUsedAt}
        />
        <Transcript messages={messages} />
      </div>
    </>
  );
}

// ─── Header + meta ────────────────────────────────────────────────────────────

function Header({
  threadId,
  sessionId,
  msgCount,
  lastUsedAt,
}: {
  threadId: string;
  sessionId: string;
  msgCount: number;
  lastUsedAt: string;
}): JSX.Element {
  return (
    <header className="flex items-end justify-between gap-6 border-b border-border-subtle pb-6">
      <div className="flex-1 min-w-0">
        <h1 className="font-mono text-2xl font-medium leading-[30px] text-text-primary m-0">
          {threadId}
        </h1>
        <MetaBar sessionId={sessionId} msgCount={msgCount} lastUsedAt={lastUsedAt} />
      </div>
      <ActionButtons />
    </header>
  );
}

function MetaBar({
  sessionId,
  msgCount,
  lastUsedAt,
}: {
  sessionId: string;
  msgCount: number;
  lastUsedAt: string;
}): JSX.Element {
  return (
    <div className="flex items-center flex-wrap gap-3 mt-4">
      <span className="bg-panel-2 border border-gold-line px-2.5 py-1 font-mono text-[11px] leading-[14px] text-gold">
        slack
      </span>
      <Sep />
      <span className="font-sans text-[13px] leading-4 text-text-secondary">
        session {sessionId}
      </span>
      <Sep />
      <span className="font-sans text-[13px] leading-4 text-text-secondary">
        {msgCount} {msgCount === 1 ? 'message' : 'messages'}
      </span>
      <Sep />
      <span className="font-sans text-[13px] leading-4 text-text-secondary">
        backend claude-code
      </span>
      <Sep />
      <span className="font-sans text-[13px] leading-4 text-text-secondary">
        {relativeFrom(lastUsedAt)}
      </span>
    </div>
  );
}

function Sep(): JSX.Element {
  return <span className="font-sans text-base leading-5 text-text-tertiary select-none">·</span>;
}

function ActionButtons(): JSX.Element {
  return (
    <div className="flex shrink-0 self-end gap-2">
      <button
        type="button"
        className="inline-flex items-center gap-2 px-3.5 py-2 border border-transparent font-mono text-xs font-medium tracking-[0.06em] leading-4 uppercase text-text-secondary hover:text-text-primary transition-colors duration-[120ms]"
      >
        open in slack ↗
      </button>
      <button
        type="button"
        className="inline-flex items-center gap-2 px-3.5 py-2 border border-gold-line font-mono text-xs font-medium tracking-[0.06em] leading-4 uppercase text-gold hover:bg-gold-soft hover:border-gold transition-colors duration-[120ms]"
      >
        view jsonl
      </button>
    </div>
  );
}

// ─── Transcript ──────────────────────────────────────────────────────────────

function Transcript({ messages }: { messages: SessionMessageApi[] }): JSX.Element {
  return (
    <div className="bg-panel border border-border-subtle py-6 px-6 flex flex-col gap-4">
      {messages.length === 0 ? (
        <span className="font-mono text-xs text-text-tertiary">[no transcript available]</span>
      ) : (
        messages.map((m) => <MessageBlock key={m.id} message={m} />)
      )}
      <LiveRow />
    </div>
  );
}

function LiveRow(): JSX.Element {
  return (
    <div className="flex items-start gap-4">
      <div className="shrink-0 w-20 pt-1 flex flex-col gap-[2px]">
        <span className="text-right font-mono text-[10px] font-medium tracking-[0.12em] leading-3 uppercase text-text-tertiary">
          live
        </span>
        <span className="text-right font-mono text-[10px] tracking-[0.12em] leading-3 uppercase text-text-tertiary">
          …
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 border border-dashed border-border-subtle px-3.5 py-3">
          <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-status-active" />
          <span className="font-mono text-xs leading-4 text-text-tertiary">
            waiting for next message in thread · read-only view
          </span>
        </div>
      </div>
    </div>
  );
}
