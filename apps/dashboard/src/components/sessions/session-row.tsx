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
      className="group relative flex min-w-[840px] items-center gap-4 border-b border-border-subtle px-5 py-3.5 text-left transition-colors hover:bg-panel-2 last:border-b-0"
    >
      <span className="pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-gold opacity-0 transition-opacity group-hover:opacity-100" />

      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="font-mono text-[13px] font-medium tracking-[0.02em] text-text-primary">
          {session.threadId}
        </span>
        <span className="font-mono text-[10px] tracking-[0.04em] text-text-tertiary">
          session · {session.sessionId}
        </span>
      </div>

      <span className="w-[280px] shrink-0 truncate text-[13px] leading-snug text-text-secondary" />

      <div className="flex w-[120px] shrink-0 flex-col gap-[2px]">
        <span className="font-mono text-xs text-text-primary">
          {relativeFrom(session.lastUsedAt)}
        </span>
        <span className="font-mono text-[10px] tracking-[0.04em] text-text-tertiary">
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
