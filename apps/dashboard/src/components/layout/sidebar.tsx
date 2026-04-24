import { Link, useLocation } from '@tanstack/react-router';
import type { DotTone } from '@zeno/ui';
import { Crest, Dot } from '@zeno/ui';
import type { ComponentType, JSX } from 'react';
import { IcoCron, IcoHome, IcoLogs, IcoSessions, IcoSettings } from '@/components/icons';
import { type ServiceStatus, useHealth } from '@/lib/use-health';

interface NavItem {
  id: string;
  label: string;
  to: string;
  key: string;
  Ico: ComponentType<{ size?: number; className?: string }>;
}

const navItems: ReadonlyArray<NavItem> = [
  { id: 'home', label: 'home', to: '/', key: 'H', Ico: IcoHome },
  { id: 'crons', label: 'crons', to: '/crons', key: 'C', Ico: IcoCron },
  { id: 'sessions', label: 'sessions', to: '/sessions', key: 'S', Ico: IcoSessions },
  { id: 'logs', label: 'logs', to: '/logs', key: 'L', Ico: IcoLogs },
  { id: 'settings', label: 'settings', to: '/settings', key: ',', Ico: IcoSettings },
];

const statusToDot: Record<ServiceStatus, DotTone> = {
  ticking: 'active',
  idle: 'idle',
  stale: 'paused',
  unknown: 'idle',
};

const statusLabel: Record<ServiceStatus, string> = {
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

function isActive(itemTo: string, currentPath: string): boolean {
  if (itemTo === '/') return currentPath === '/';
  return currentPath.startsWith(itemTo);
}

export function Sidebar(): JSX.Element {
  const location = useLocation();
  const currentPath = location.pathname;
  const health = useHealth();
  const services = health.data?.services ?? {
    backend: 'unknown' as ServiceStatus,
    slack: 'unknown' as ServiceStatus,
    runner: 'unknown' as ServiceStatus,
  };
  const uptime = health.data?.uptime ?? 0;

  return (
    <aside className="relative z-[1] flex h-screen flex-col border-r border-border-subtle bg-sidebar">
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-3">
        <Crest size={22} />
        <span
          className="font-mono text-[15px] font-medium text-text-primary"
          style={{ letterSpacing: '0.08em' }}
        >
          zeno
        </span>
        <span className="ml-auto font-mono text-[9px] text-text-tertiary">v0.3.1</span>
      </div>
      <div className="relative mx-5 border-b border-border-subtle">
        <div className="absolute bottom-0 left-0 h-px w-7 bg-gold" />
      </div>

      <nav className="flex flex-col gap-0.5 px-3 pt-5">
        <span
          className="mb-2 px-2 font-mono text-[9px] uppercase text-text-tertiary"
          style={{ letterSpacing: '0.25em' }}
        >
          console
        </span>
        {navItems.map((item) => {
          const active = isActive(item.to, currentPath);
          return (
            <Link
              key={item.id}
              to={item.to}
              className={
                active
                  ? 'relative flex items-center gap-2.5 rounded-sm bg-gold-soft px-2.5 py-1.5 font-mono text-[12px] font-medium text-gold'
                  : 'relative flex items-center gap-2.5 rounded-sm px-2.5 py-1.5 font-mono text-[12px] font-medium text-text-secondary hover:bg-white/[0.015] hover:text-text-primary'
              }
              style={{ letterSpacing: '0.04em' }}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-[18px] w-[3px] -translate-y-1/2 rounded-r-sm bg-gold" />
              )}
              <item.Ico size={14} className={active ? 'text-gold' : 'text-text-tertiary'} />
              <span>{item.label}</span>
              <span className="ml-auto font-mono text-[10px] text-text-tertiary">
                {'⌘'}
                {item.key}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto mx-4 mb-4 rounded border border-border-subtle bg-black/30 px-3 py-3">
        <span
          className="font-mono text-[9px] uppercase text-gold"
          style={{ letterSpacing: '0.2em' }}
        >
          runtime
        </span>
        <div className="mt-2.5 flex flex-col gap-2">
          <div className="flex items-center gap-2 font-mono text-[11px] text-text-secondary">
            <Dot tone={statusToDot[services.backend]} pulse={services.backend === 'ticking'} />
            <span>
              backend {'·'} <span className="text-gold">claude-code</span>
            </span>
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px] text-text-secondary">
            <Dot tone={statusToDot[services.slack]} />
            <span>
              slack {'·'} {statusLabel[services.slack]}
            </span>
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px] text-text-secondary">
            <Dot tone={statusToDot[services.runner]} />
            <span>
              runner {'·'} {statusLabel[services.runner]}
            </span>
          </div>
          <div className="font-mono text-[11px] text-text-tertiary" style={{ paddingLeft: 14 }}>
            uptime {'·'} {formatUptime(uptime)}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2.5 border-t border-border-subtle px-4 py-3">
        <div className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded bg-gold font-mono text-[11px] font-semibold text-text-ink">
          GR
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-mono text-[12px] text-text-primary">operator</span>
          <span className="font-mono text-[9px] text-text-tertiary">single-owner {'·'} hmac</span>
        </div>
        <Link
          to="/login"
          className="rounded border border-border-subtle px-2 py-0.5 font-mono text-[10px] text-text-tertiary hover:border-gold-line hover:text-gold"
        >
          exit
        </Link>
      </div>
    </aside>
  );
}
