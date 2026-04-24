import { createFileRoute, Link } from '@tanstack/react-router';
import { Button, Dot, ErrorState, Kicker, Skeleton } from '@zeno/ui';
import type { JSX } from 'react';
import { MessageBlock } from '@/components/sessions/message-block';
import { useSession } from '@/lib/use-session';

export const Route = createFileRoute('/_authed/sessions/$threadId')({
  component: SessionDetailPage,
});

function relativeFrom(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function SessionDetailPage(): JSX.Element {
  const { threadId } = Route.useParams();
  const q = useSession(threadId);

  if (q.isLoading) {
    return (
      <div className="mx-auto flex max-w-[1080px] flex-col gap-6 px-12 py-10">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-8 w-80" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (q.isError || !q.data) {
    return <ErrorState onRetry={() => void q.refetch()} />;
  }

  const { session, messages } = q.data;

  return (
    <div className="mx-auto flex max-w-[1080px] flex-col gap-10 px-12 py-10">
      <nav className="flex items-center gap-2 text-xs text-text-tertiary">
        <Link to="/sessions" className="hover:text-text-secondary">
          <Kicker mute>sessions</Kicker>
        </Link>
        <span>/</span>
        <span className="font-mono text-text-secondary">{session.sessionId}</span>
      </nav>

      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-6">
          <h1 className="font-mono text-2xl font-medium text-text-primary">
            {session.threadId}
          </h1>
          <div className="flex shrink-0 gap-2">
            <Button variant="ghost">open in slack ↗</Button>
            <Button variant="outline">view jsonl</Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-text-secondary">
          <span className="inline-flex items-center border border-border-subtle bg-panel px-2.5 py-0.5 font-mono text-[11px] text-text-primary">
            {session.threadId.split(' ')[0] ?? session.threadId}
          </span>
          <span className="text-text-tertiary">·</span>
          <span>
            session{' '}
            <span className="font-mono text-gold">{session.sessionId}</span>
          </span>
          <span className="text-text-tertiary">·</span>
          <span>{messages.length} messages</span>
          <span className="text-text-tertiary">·</span>
          <span>
            backend <span className="text-text-primary">claude-code</span>
          </span>
          <span className="text-text-tertiary">·</span>
          <span>{relativeFrom(session.lastUsedAt)}</span>
        </div>
      </header>

      <section className="flex flex-col gap-0 border border-border-subtle bg-panel p-6">
        {messages.length === 0 ? (
          <span className="text-sm text-text-secondary">[no transcript available]</span>
        ) : (
          messages.map((m) => <MessageBlock key={m.id} message={m} />)
        )}

        <div className="mt-6 grid grid-cols-[80px_1fr] gap-0">
          <div className="flex flex-col gap-0.5 pt-3 text-text-tertiary">
            <span className="text-xs font-bold">live</span>
            <span className="font-mono text-[10px]">...</span>
          </div>
          <div className="flex items-center gap-2 border border-dashed border-border-subtle p-3 font-mono text-xs text-text-tertiary">
            <Dot tone="active" pulse />
            waiting for next message in thread · read-only view
          </div>
        </div>
      </section>
    </div>
  );
}
