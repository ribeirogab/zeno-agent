import { createFileRoute } from '@tanstack/react-router';
import { EmptyState } from '@zeno/ui';
import type { JSX } from 'react';
import { SessionRow } from '@/components/sessions/session-row';
import { SessionListSkeleton } from '@/components/skeletons/session-list-skeleton';
import { useSessions } from '@/lib/use-sessions';

export const Route = createFileRoute('/_authed/sessions/')({
  component: SessionsPage,
});

function SessionsPage(): JSX.Element {
  const q = useSessions();
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
          Conversations
        </span>
        <h1 className="text-[22px] font-semibold tracking-tight text-text-primary">Sessions</h1>
        <p className="max-w-[560px] text-sm leading-5 text-text-secondary">
          Slack threads mapped to SDK sessions. Click to see the full conversation.
        </p>
      </header>
      <section className="flex flex-col">
        {q.isLoading ? (
          <SessionListSkeleton />
        ) : q.data?.length === 0 ? (
          <EmptyState
            title="no sessions yet"
            description="chat with Zeno on Slack to get started."
          />
        ) : (
          q.data?.map((s) => <SessionRow key={s.threadId} session={s} />)
        )}
      </section>
    </div>
  );
}
