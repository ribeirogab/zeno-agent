import type { JSX } from 'react';
import { cn } from '../utils';

export type DotTone = 'active' | 'paused' | 'failed' | 'info' | 'idle';

export interface DotProps {
  tone?: DotTone;
  pulse?: boolean;
  className?: string;
}

const toneColor: Record<DotTone, string> = {
  active: 'bg-status-active',
  paused: 'bg-status-paused',
  failed: 'bg-status-failed',
  info: 'bg-status-info',
  idle: 'bg-text-tertiary',
};

const pulseClass: Record<DotTone, string> = {
  active: 'animate-pulse-jade',
  paused: 'animate-pulse-gold',
  failed: 'animate-pulse-carmine',
  info: 'animate-pulse-jade',
  idle: '',
};

export function Dot({ tone = 'active', pulse = false, className }: DotProps): JSX.Element {
  return (
    <span
      className={cn(
        'inline-block h-1.5 w-1.5 shrink-0 rounded-full',
        toneColor[tone],
        pulse && pulseClass[tone],
        className,
      )}
    />
  );
}
