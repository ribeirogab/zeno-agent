import { Link } from '@tanstack/react-router';
import type { JSX } from 'react';
import type { SessionApi } from '@/lib/use-sessions';

function relativeFrom(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

export function SessionRow({ session }: { session: SessionApi }): JSX.Element {
  return (
    <Link
      to="/sessions/$threadId"
      params={{ threadId: session.threadId }}
      className="flex items-center gap-4 border-b border-panel py-4 hover:bg-panel/40"
    >
      <div className="flex flex-col gap-1 flex-1 min-w-0">
        <span className="truncate font-mono text-sm text-text-primary">{session.threadId}</span>
        <span className="font-mono text-xs text-text-tertiary">{session.sessionId}</span>
      </div>
      <span className="w-32 shrink-0 text-right text-xs text-text-secondary">
        {relativeFrom(session.lastUsedAt)}
      </span>
    </Link>
  );
}
