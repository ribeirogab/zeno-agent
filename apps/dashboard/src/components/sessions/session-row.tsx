import { Link } from '@tanstack/react-router';
import { Dot } from '@zeno/ui';
import type { JSX } from 'react';
import type { SessionApi } from '@/lib/use-sessions';

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

export function SessionRow({ session }: { session: SessionApi }): JSX.Element {
  return (
    <Link
      to="/sessions/$threadId"
      params={{ threadId: session.threadId }}
      className="flex items-center border-b border-panel py-4 hover:bg-panel/40"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-sm font-medium text-text-primary">
          {session.threadId}
        </span>
        <span className="font-mono text-[11px] text-text-tertiary">
          session · {session.sessionId}
        </span>
      </div>
      <span className="w-[280px] shrink-0 truncate text-sm text-text-secondary" />
      <div className="flex w-[120px] shrink-0 flex-col gap-0.5">
        <span className="text-xs text-text-secondary">{relativeFrom(session.lastUsedAt)}</span>
        <span className="font-mono text-[11px] text-text-tertiary">
          {formatDate(session.lastUsedAt)}
        </span>
      </div>
      <span className="w-[70px] shrink-0 font-mono text-xs text-gold" />
      <span className="flex w-[128px] shrink-0 items-center gap-1.5">
        <Dot tone="active" />
        <span className="font-mono text-[11px] text-text-secondary">claude-code</span>
      </span>
    </Link>
  );
}
