import { createFileRoute } from '@tanstack/react-router';
import type { JSX } from 'react';
import { SessionRow } from '@/components/sessions/SessionRow';
import { useSessions } from '@/lib/use-sessions';

export const Route = createFileRoute('/_authed/sessions')({
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
          Threads de Slack mapeados pra sessões do SDK. Clica pra ver a conversa completa.
        </p>
      </header>
      <section className="flex flex-col">
        {q.isLoading && <span className="py-4 text-sm text-text-secondary">carregando…</span>}
        {q.data?.length === 0 && (
          <span className="py-4 text-sm text-text-secondary">nenhuma sessão ainda</span>
        )}
        {q.data?.map((s) => (
          <SessionRow key={s.threadId} session={s} />
        ))}
      </section>
    </div>
  );
}
