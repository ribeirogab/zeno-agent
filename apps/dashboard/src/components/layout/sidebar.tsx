import { Link, useLocation } from '@tanstack/react-router';
import type { JSX } from 'react';
import { type ServiceStatus, useHealth } from '@/lib/use-health';
import { useTheme } from '@/lib/use-theme';

interface NavItem {
  label: string;
  to: string;
  enabled: boolean;
}

const navItems: ReadonlyArray<NavItem> = [
  { label: 'Home', to: '/', enabled: true },
  { label: 'Crons', to: '/crons', enabled: true },
  { label: 'Sessions', to: '/sessions', enabled: true },
  { label: 'Settings', to: '/settings', enabled: true },
  { label: 'Logs', to: '/logs', enabled: true },
];

const dotColor: Record<ServiceStatus, string> = {
  ticking: 'bg-status-active',
  idle: 'bg-text-tertiary',
  stale: 'bg-status-paused',
  unknown: 'bg-text-tertiary',
};

const labelText: Record<ServiceStatus, string> = {
  ticking: 'ticking',
  idle: 'idle',
  stale: 'stale',
  unknown: 'unknown',
};

export interface SidebarProps {
  onNavigate?: () => void;
}

function SunIcon(): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <title>sun</title>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon(): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <title>moon</title>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export function Sidebar({ onNavigate }: SidebarProps = {}): JSX.Element {
  const location = useLocation();
  const currentPath = location.pathname;
  const health = useHealth();
  const { theme, toggle: toggleTheme } = useTheme();
  const services = health.data?.services ?? {
    backend: 'unknown' as ServiceStatus,
    slack: 'unknown' as ServiceStatus,
    runner: 'unknown' as ServiceStatus,
  };

  return (
    <aside className="flex h-full w-full shrink-0 flex-col gap-7 border-r border-border-subtle bg-sidebar px-5 py-6 md:h-screen md:w-60">
      <div className="flex items-center gap-2.5">
        <span className="font-serif text-2xl italic leading-none text-accent">Z</span>
        <span className="text-sm tracking-wide text-text-primary">zeno</span>
      </div>

      <nav className="flex flex-col gap-0.5">
        {navItems.map((item) => {
          const isActive = item.to === currentPath;
          if (!item.enabled) {
            return (
              <span
                key={item.to}
                className="flex cursor-not-allowed items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-text-tertiary"
                title="em breve"
              >
                {item.label}
              </span>
            );
          }
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={
                isActive
                  ? 'flex items-center gap-2.5 rounded-md bg-panel px-2.5 py-2 text-sm font-medium text-text-primary'
                  : 'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-text-secondary hover:text-text-primary'
              }
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-col gap-3">
        <span className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
          Status
        </span>
        <div className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotColor[services.backend]}`} />
          <span className="text-xs text-text-secondary">
            backend · {labelText[services.backend]}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotColor[services.slack]}`} />
          <span className="text-xs text-text-secondary">slack · {labelText[services.slack]}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotColor[services.runner]}`} />
          <span className="text-xs text-text-secondary">runner · {labelText[services.runner]}</span>
        </div>
      </div>

      <div className="mt-auto flex items-center gap-2.5 border-t border-border-subtle pt-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-border-subtle text-[11px] font-semibold text-text-primary">
          GR
        </div>
        <span className="flex-1 text-sm text-text-secondary">Operator</span>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'switch to light theme' : 'switch to dark theme'}
          className="rounded-md p-1.5 text-text-tertiary hover:bg-panel hover:text-text-primary"
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>
    </aside>
  );
}
