import { createFileRoute, Link } from '@tanstack/react-router';
import { Button, Dot, ErrorState, Skeleton } from '@zeno/ui';
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
      <div className="zen-page">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-8 w-80" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <div className="zen-page">
        <ErrorState onRetry={() => void q.refetch()} />
      </div>
    );
  }

  const { session, messages } = q.data;

  return (
    <div className="zen-page">
      <nav className="flex items-center gap-2 font-mono text-[11px] tracking-[0.06em]">
        <Link
          to="/sessions"
          className="uppercase text-text-tertiary transition-colors hover:text-text-primary"
        >
          sessions
        </Link>
        <span className="text-text-tertiary">/</span>
        <span className="uppercase text-gold">{session.sessionId}</span>
      </nav>

      <header className="flex items-end justify-between gap-6 border-b border-border-subtle pb-6">
        <div>
          <h1 className="font-mono text-2xl font-medium text-text-primary">{session.threadId}</h1>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="border border-gold-line bg-panel-2 px-2.5 py-1 font-mono text-[11px] text-gold">
              {session.threadId.split(' ')[0] ?? session.threadId}
            </span>
            <span className="text-text-tertiary">·</span>
            <span className="text-[13px] leading-snug text-text-secondary">
              session <span className="font-mono text-gold">{session.sessionId}</span>
            </span>
            <span className="text-text-tertiary">·</span>
            <span className="text-[13px] leading-snug text-text-secondary">
              {messages.length} messages
            </span>
            <span className="text-text-tertiary">·</span>
            <span className="text-[13px] leading-snug text-text-secondary">
              backend <span className="text-text-primary">claude-code</span>
            </span>
            <span className="text-text-tertiary">·</span>
            <span className="text-[13px] leading-snug text-text-secondary">
              {relativeFrom(session.lastUsedAt)}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="ghost">open in slack ↗</Button>
          <Button variant="outline">view jsonl</Button>
        </div>
      </header>

      <section className="flex flex-col gap-4 border border-border-subtle bg-panel p-6">
        {messages.length === 0 ? (
          <span className="text-sm text-text-secondary">[no transcript available]</span>
        ) : (
          messages.map((m) => <MessageBlock key={m.id} message={m} />)
        )}

        <div className="grid grid-cols-[80px_1fr] gap-4">
          <div className="pt-1 text-right font-mono text-[10px] uppercase tracking-[0.12em] text-text-tertiary">
            <b className="mb-0.5 block font-medium text-text-tertiary">live</b>
            <span>...</span>
          </div>
          <div className="flex items-center gap-2 border border-dashed border-border-subtle px-3.5 py-3 font-mono text-xs text-text-tertiary">
            <Dot tone="active" pulse />
            waiting for next message in thread · read-only view
          </div>
        </div>
      </section>
    </div>
  );
}
