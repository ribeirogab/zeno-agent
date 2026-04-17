import { createFileRoute, Link } from '@tanstack/react-router';
import { ErrorState, Skeleton } from '@zeno/ui';
import type { JSX } from 'react';
import { MessageBlock } from '@/components/sessions/message-block';
import { useSession } from '@/lib/use-session';

export const Route = createFileRoute('/_authed/sessions/$threadId')({
  component: SessionDetailPage,
});

function SessionDetailPage(): JSX.Element {
  const { threadId } = Route.useParams();
  const q = useSession(threadId);

  if (q.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-7 w-80" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }
  if (q.isError || !q.data) {
    return <ErrorState onRetry={() => void q.refetch()} />;
  }

  const { session, messages } = q.data;

  return (
    <div className="flex max-w-[800px] flex-col gap-8">
      <nav className="text-xs text-text-tertiary">
        <Link to="/sessions" className="hover:text-text-secondary">
          Sessions
        </Link>
        <span className="mx-2">/</span>
        <span className="font-mono text-text-secondary">{session.threadId}</span>
      </nav>

      <header className="flex flex-col gap-2">
        <h1 className="font-serif text-2xl leading-tight text-text-primary">{session.threadId}</h1>
        <div className="flex items-center gap-3 text-xs text-text-secondary">
          <span>
            iniciou <span className="text-text-primary">{session.createdAt}</span>
          </span>
          <span>·</span>
          <span>{messages.length} mensagens</span>
          <span>·</span>
          <span>
            session <span className="font-mono text-text-primary">{session.sessionId}</span>
          </span>
        </div>
      </header>

      <section className="flex flex-col gap-4">
        {messages.length === 0 && (
          <span className="text-sm text-text-secondary">[sem transcript disponível]</span>
        )}
        {messages.map((m) => (
          <MessageBlock key={m.id} message={m} />
        ))}
      </section>
    </div>
  );
}
