import { Link, useLocation } from '@tanstack/react-router';
import { Crest } from '@zeno/ui';
import type { JSX, ReactNode } from 'react';
import { type ServiceStatus, useHealth } from '@/lib/use-health';
import { useSettings } from '@/lib/use-settings';

type NavId = 'home' | 'crons' | 'channels' | 'connectors' | 'skills' | 'logs' | 'settings';

// Spec 0066 B: `sessions` removed from the primary nav. The route
// stays mounted (`/sessions/*`) and is reachable from log entries
// and cron run history — operators don't navigate there to act.
const NAV: { id: NavId; label: string; to: string; badge?: number }[] = [
  { id: 'home', label: 'home', to: '/' },
  { id: 'crons', label: 'crons', to: '/crons' },
  // Spec 0059: channels (transport substrate) sit ABOVE connectors
  // (tool surface) — conceptual ordering: where Zeno talks vs what Zeno calls.
  { id: 'channels', label: 'channels', to: '/channels' },
  { id: 'connectors', label: 'connectors', to: '/connectors' },
  { id: 'skills', label: 'skills', to: '/skills' },
  { id: 'logs', label: 'logs', to: '/logs' },
  { id: 'settings', label: 'settings', to: '/settings' },
];

/**
 * Dashboard sidebar — sticky 252px column.
 *
 * Brand row (crest + word + version) → Nav (5 items, gold-soft active marker)
 * → auto-margined StatusPanel (live runtime via `useHealth`) → user row.
 *
 * Imports `Link` directly from `@tanstack/react-router` — the typed router is
 * local to this app, so no Link-by-prop indirection needed (see spec 0031).
 */
export function DashboardSidebar(): JSX.Element {
  const location = useLocation();
  const activeId = navIdForPath(location.pathname);
  return (
    <aside className="bg-sidebar border-r border-border-subtle px-[14px] pt-[18px] pb-[14px] flex flex-col gap-6 sticky top-0 h-screen w-[252px] shrink-0">
      <Brand />
      <Nav active={activeId} />
      <StatusPanel />
      <User />
    </aside>
  );
}

function navIdForPath(path: string): NavId {
  if (path === '/') return 'home';
  if (path.startsWith('/crons')) return 'crons';
  if (path.startsWith('/channels')) return 'channels';
  if (path.startsWith('/connectors')) return 'connectors';
  if (path.startsWith('/skills')) return 'skills';
  if (path.startsWith('/logs')) return 'logs';
  if (path.startsWith('/settings')) return 'settings';
  // /sessions/* deep-links land on the route but no nav item highlights
  return 'home';
}

function Brand(): JSX.Element {
  return (
    <div className="relative flex items-center gap-[10px] px-2 pt-1.5 pb-4 border-b border-border-subtle">
      <span className="text-gold">
        <Crest size={22} />
      </span>
      <span className="font-mono text-[15px] font-medium tracking-[0.08em] text-text-primary">
        zeno
      </span>
      <span className="ml-auto font-mono text-[9px] tracking-[0.15em] text-text-tertiary">
        v0.3.1
      </span>
      <div className="absolute -bottom-px left-2 w-7 h-px bg-gold" />
    </div>
  );
}

function Nav({ active }: { active: NavId }): JSX.Element {
  return (
    <nav className="flex flex-col gap-px">
      <span className="font-mono text-[9px] tracking-[0.25em] uppercase text-text-tertiary px-3 pt-2.5 pb-1.5">
        console
      </span>
      {NAV.map((it) => (
        <NavItem key={it.id} {...it} active={active === it.id} />
      ))}
    </nav>
  );
}

function NavItem({
  id,
  label,
  to,
  badge,
  active,
}: {
  id: NavId;
  label: string;
  to: string;
  badge?: number;
  active?: boolean;
}): JSX.Element {
  const baseClass =
    'relative pl-4 pr-3 py-[9px] font-mono text-xs font-medium tracking-[0.04em] flex items-center gap-2.5 transition-[color,background] duration-[120ms]';

  if (active) {
    return (
      <Link to={to} className={`${baseClass} text-gold bg-gold-soft`}>
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[18px] bg-gold" />
        <span className="w-3.5 h-3.5 inline-flex items-center justify-center shrink-0 text-gold">
          <NavIcon id={id} />
        </span>
        <span>{label}</span>
        {badge ? (
          <span className="ml-auto px-1.5 py-px font-mono text-[9px] tracking-[0.1em] text-status-failed bg-status-failed/10 border border-status-failed/30">
            {badge}
          </span>
        ) : null}
      </Link>
    );
  }

  return (
    <Link
      to={to}
      className={`${baseClass} text-text-secondary hover:text-text-primary hover:bg-white/[0.015]`}
    >
      <span className="w-3.5 h-3.5 inline-flex items-center justify-center shrink-0 text-text-tertiary">
        <NavIcon id={id} />
      </span>
      <span>{label}</span>
      {badge ? (
        <span className="ml-auto px-1.5 py-px font-mono text-[9px] tracking-[0.1em] text-status-failed bg-status-failed/10 border border-status-failed/30">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

function NavIcon({ id }: { id: NavId }): JSX.Element {
  const props = {
    width: 14,
    height: 14,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (id) {
    case 'home':
      return (
        <svg {...props} aria-hidden="true">
          <path d="M3 11l9-8 9 8" />
          <path d="M5 10v10h14V10" />
        </svg>
      );
    case 'crons':
      return (
        <svg {...props} aria-hidden="true">
          <circle cx="12" cy="13" r="7" />
          <path d="M12 9v4l2.5 2" />
          <path d="M9 2h6" />
        </svg>
      );
    case 'channels':
      // chat-bubble silhouette (spec 0059) — stroke-based, matches set
      return (
        <svg {...props} aria-hidden="true">
          <path d="M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-4 4v-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
        </svg>
      );
    case 'connectors':
      return (
        <svg {...props} aria-hidden="true">
          <path d="M9 7v4M15 7v4" />
          <path d="M5 11h14v3a4 4 0 0 1-4 4h-6a4 4 0 0 1-4-4v-3z" />
          <path d="M12 18v3" />
        </svg>
      );
    case 'skills':
      return (
        <svg {...props} aria-hidden="true">
          {/* book-page icon — playbooks */}
          <path d="M6 3 H18 V21 H6 Z" />
          <path d="M9 8 H15 M9 12 H15 M9 16 H13" />
        </svg>
      );
    case 'logs':
      return (
        <svg {...props} aria-hidden="true">
          <path d="M4 5h16M4 10h16M4 15h10M4 20h16" />
        </svg>
      );
    case 'settings':
      return (
        <svg {...props} aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .4 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.4 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .4-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.4-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.4H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.4l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.4 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
        </svg>
      );
  }
}

const STATUS_TONE: Record<ServiceStatus, 'active' | 'paused' | 'failed'> = {
  ticking: 'active',
  idle: 'paused',
  stale: 'failed',
  unknown: 'paused',
};

const STATUS_LABEL: Record<ServiceStatus, string> = {
  ticking: 'ticking',
  idle: 'idle',
  stale: 'stale',
  unknown: 'unknown',
};

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`;
}

function StatusPanel(): JSX.Element {
  const health = useHealth();
  const services = health.data?.services ?? {
    backend: 'unknown' as ServiceStatus,
    slack: 'unknown' as ServiceStatus,
    runner: 'unknown' as ServiceStatus,
  };
  const uptime = health.data?.uptime ?? 0;

  return (
    <div className="mt-auto relative px-3 pt-3 pb-3.5 border border-border-subtle bg-black/30 flex flex-col gap-2">
      <span className="absolute -top-px left-3 right-3 h-px bg-gold-line" />
      <span className="font-mono text-[9px] tracking-[0.2em] uppercase text-gold mb-0.5">
        runtime
      </span>
      <StatusRow
        tone={STATUS_TONE[services.backend]}
        label={
          <>
            backend · <span className="text-gold">claude-code</span>
          </>
        }
      />
      <StatusRow
        tone={STATUS_TONE[services.slack]}
        label={`slack · ${STATUS_LABEL[services.slack]}`}
      />
      <StatusRow
        tone={STATUS_TONE[services.runner]}
        label={`runner · ${STATUS_LABEL[services.runner]}`}
      />
      <span className="font-mono text-[10.5px] text-text-tertiary tracking-[0.02em] pl-3.5">
        uptime · {formatUptime(uptime)}
      </span>
    </div>
  );
}

function StatusRow({
  tone,
  label,
}: {
  tone: 'active' | 'paused' | 'failed';
  label: ReactNode;
}): JSX.Element {
  const bg = {
    active: 'bg-status-active',
    paused: 'bg-status-paused',
    failed: 'bg-status-failed',
  }[tone];
  return (
    <div className="flex items-center gap-2 font-mono text-[10.5px] text-text-secondary tracking-[0.02em]">
      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${bg}`} />
      <span>{label}</span>
    </div>
  );
}

/**
 * Compute initials for the avatar tile.
 *
 * Spec 0066 A:
 * - Multi-word names ("Maria José", "John Doe") → first char of first
 *   word + first char of last word ("MJ", "JD").
 * - Single-word names → first 2 chars uppercased ("Operator" → "GA").
 * - Empty / undefined → fall back to first 2 chars of the slug.
 * - Anything else (numeric, symbols) is uppercased verbatim and sliced.
 */
export function deriveInitials(name: string | null | undefined, slug: string): string {
  const source = (name?.trim() || slug).trim();
  if (!source) return '··';
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const first = words[0]?.[0] ?? '';
    const last = words[words.length - 1]?.[0] ?? '';
    return (first + last).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

function User(): JSX.Element {
  const settings = useSettings();
  // Spec 0066 A: read identity from USER.md frontmatter via the API.
  // Until the response lands we render placeholders — never the old
  // hardcoded 'alex' / 'single-owner · hmac' strings.
  const profile = settings.data?.profile;
  const displayName = profile?.name ?? profile?.slug ?? '…';
  const subtitle = profile ? `${profile.slug} · profile` : '';
  const initials = profile ? deriveInitials(profile.name, profile.slug) : '··';

  return (
    <div className="flex items-center gap-2.5 px-2 py-2.5 border-t border-border-subtle">
      <div className="w-[26px] h-[26px] bg-gold text-text-ink grid place-items-center font-mono text-[11px] font-semibold tracking-[0.04em] shrink-0">
        {initials}
      </div>
      <div className="flex flex-col flex-1 min-w-0">
        <span className="font-mono text-xs text-text-primary truncate">{displayName}</span>
        <span className="font-mono text-[9px] text-text-tertiary tracking-[0.1em] truncate">
          {subtitle}
        </span>
      </div>
      <Link
        to="/login"
        className="px-1.5 py-1 border border-border-subtle font-mono text-[10px] text-text-tertiary tracking-[0.1em] hover:text-text-primary hover:border-border-strong transition-colors duration-[120ms]"
      >
        exit
      </Link>
    </div>
  );
}
