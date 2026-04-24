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
        'font-mono font-medium uppercase',
        mute
          ? 'text-[10px] tracking-[0.2em] text-text-tertiary'
          : 'text-[11px] tracking-[0.18em] text-gold',
        className,
      )}
    >
      {children}
    </span>
  );
}
