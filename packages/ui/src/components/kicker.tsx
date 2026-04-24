import type { JSX, ReactNode } from 'react';
import { cn } from '../utils';

export interface KickerProps {
  mute?: boolean;
  children: ReactNode;
  className?: string;
}

export function Kicker({ mute = false, children, className }: KickerProps): JSX.Element {
  return (
    <span
      className={cn(
        'font-mono text-[11px] font-medium uppercase tracking-[0.18em]',
        mute ? 'text-text-tertiary' : 'text-gold',
        className,
      )}
    >
      {children}
    </span>
  );
}
