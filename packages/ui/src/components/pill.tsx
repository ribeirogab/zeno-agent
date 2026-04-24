import type { JSX, ReactNode } from 'react';
import { cn } from '../utils';
import { Dot, type DotTone } from './dot';

export interface PillProps {
  tone?: DotTone;
  children: ReactNode;
  className?: string;
}

const toneStyles: Record<DotTone, string> = {
  active: 'text-status-active border-status-active/30 bg-status-active/[0.06]',
  paused: 'text-status-paused border-gold-line bg-gold-soft',
  failed: 'text-status-failed border-status-failed/30 bg-status-failed/[0.06]',
  info: 'text-status-info border-status-info/30 bg-status-info/[0.06]',
  idle: 'text-text-tertiary border-border-subtle bg-panel-2',
};

export function Pill({ tone = 'active', children, className }: PillProps): JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em]',
        toneStyles[tone],
        className,
      )}
    >
      <Dot tone={tone} pulse={tone === 'failed'} />
      {children}
    </span>
  );
}

export interface OutlinePillProps {
  children: ReactNode;
  className?: string;
}

export function OutlinePill({ children, className }: OutlinePillProps): JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center border border-border-subtle px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-text-tertiary',
        className,
      )}
    >
      {children}
    </span>
  );
}
