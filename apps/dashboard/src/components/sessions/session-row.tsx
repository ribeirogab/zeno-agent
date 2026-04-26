import { Link } from '@tanstack/react-router';
import type { JSX } from 'react';
import type { SessionApi } from '@/lib/use-sessions';

/**
 * Display-shaped row for the sessions table. Co-located with the row component.
 * Map from `SessionApi` via `sessionToTableRow` at the page boundary.
 */
export type SessionTableRow = {
  threadId: string;
  channel: string; // e.g. "#zeno · 1710000031.000100"
  sessionId: string; // short label, e.g. "sess_8a4f2c9b"
  lastMessage: string; // last user msg or empty
  ago: string; // "2 min ago"
  when: string; // "Mon · 14:35"
  msgs: number;
  backend: string; // "claude-code"
  status: 'active' | 'paused' | 'failed';
};

export function SessionRow({ row, last }: { row: SessionTableRow; last?: boolean }): JSX.Element {
  const borderClass = last ? '' : 'border-b border-border-subtle';
  const dotColor = {
    active: 'bg-status-active',
    paused: 'bg-status-paused',
    failed: 'bg-status-failed',
  }[row.status];

  return (
    <Link
      to="/sessions/$threadId"
      params={{ threadId: row.threadId }}
      className={`group/row relative flex items-center gap-4 px-5 py-3.5 ${borderClass} cursor-pointer transition-colors duration-[120ms] hover:bg-panel-2 min-w-[840px] before:content-[''] before:absolute before:left-0 before:inset-y-0 before:w-0.5 before:bg-gold before:opacity-0 hover:before:opacity-100 before:transition-opacity before:duration-[120ms]`}
    >
      <div className="flex-1 min-w-0 flex flex-col gap-[3px]">
        <span className="font-mono text-[13px] font-medium tracking-[0.02em] leading-4 text-text-primary truncate">
          {row.channel}
        </span>
        <span className="font-mono text-[10px] tracking-[0.04em] leading-3 text-text-tertiary truncate">
          session · {row.sessionId}
        </span>
      </div>

      <div className="w-[280px] shrink-0 overflow-hidden">
        <span className="block font-sans text-[13px] leading-4 text-text-secondary truncate">
          {row.lastMessage || '—'}
        </span>
      </div>

      <div className="w-[120px] shrink-0 flex flex-col gap-[2px]">
        <span className="font-mono text-xs leading-4 text-text-primary">{row.ago}</span>
        <span className="font-mono text-[10px] tracking-[0.04em] leading-3 text-text-tertiary">
          {row.when}
        </span>
      </div>

      <span className="w-[70px] shrink-0 font-mono text-xs leading-4 text-gold">{row.msgs}</span>

      <span className="w-[128px] shrink-0 flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
        <span className="font-mono text-[11px] leading-[14px] text-text-primary">
          {row.backend}
        </span>
      </span>
    </Link>
  );
}

// ─── Mapper ───────────────────────────────────────────────────────────────────

export function sessionToTableRow(s: SessionApi): SessionTableRow {
  return {
    threadId: s.threadId,
    channel: s.threadId, // The API doesn't currently return channel name + ts split.
    sessionId: s.sessionId,
    lastMessage: '',
    ago: relativeFrom(s.lastUsedAt),
    when: formatDate(s.lastUsedAt),
    msgs: 0,
    backend: 'claude-code',
    status: 'active',
  };
}

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
