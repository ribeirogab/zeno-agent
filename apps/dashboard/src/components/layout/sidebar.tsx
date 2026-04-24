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
  badge?: number;
}

const navItems: ReadonlyArray<NavItem> = [
  { id: 'home', label: 'home', to: '/', key: 'H', Ico: IcoHome },
  { id: 'crons', label: 'crons', to: '/crons', key: 'C', Ico: IcoCron },
  { id: 'sessions', label: 'sessions', to: '/sessions', key: 'S', Ico: IcoSessions },
  { id: 'logs', label: 'logs', to: '/logs', key: 'L', Ico: IcoLogs, badge: 1 },
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
    <aside className="zen-sidebar">
      {/* Brand */}
      <div className="zen-brand">
        <span className="text-gold">
          <Crest size={22} />
        </span>
        <span className="zen-brand-word">zeno</span>
        <span className="zen-brand-hex">v0.3.1</span>
      </div>

      {/* Nav */}
      <nav className="zen-nav">
        <div className="zen-nav-group-label">console</div>
        {navItems.map((item) => {
          const active = isActive(item.to, currentPath);
          return (
            <Link
              key={item.id}
              to={item.to}
              className={active ? 'zen-nav-item active' : 'zen-nav-item'}
            >
              <span className="zen-nav-icon">
                <item.Ico size={14} />
              </span>
              <span>{item.label}</span>
              {item.badge ? (
                <span className="zen-nav-badge">{item.badge}</span>
              ) : (
                <span className="zen-nav-key">
                  {'⌘'}
                  {item.key}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Status panel */}
      <div className="zen-status-panel">
        <span className="zen-status-label">runtime</span>
        <div className="zen-status-row">
          <Dot tone={statusToDot[services.backend]} pulse={services.backend === 'ticking'} />
          <span>
            backend {'·'} <span style={{ color: 'var(--color-gold)' }}>claude-code</span>
          </span>
        </div>
        <div className="zen-status-row">
          <Dot tone={statusToDot[services.slack]} />
          <span>
            slack {'·'} {statusLabel[services.slack]}
          </span>
        </div>
        <div className="zen-status-row">
          <Dot tone={statusToDot[services.runner]} />
          <span>
            runner {'·'} {statusLabel[services.runner]}
          </span>
        </div>
        <div className="zen-status-row zen-status-row--muted">
          uptime {'·'} {formatUptime(uptime)}
        </div>
      </div>

      {/* User */}
      <div className="zen-user">
        <div className="zen-avatar">GR</div>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <span className="zen-user-name">operator</span>
          <span className="zen-user-meta">single-owner {'·'} hmac</span>
        </div>
        <Link to="/login" className="zen-user-logout">
          exit
        </Link>
      </div>
    </aside>
  );
}
