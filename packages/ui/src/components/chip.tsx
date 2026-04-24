import type { JSX, ReactNode } from 'react';
import { cn } from '../utils';

export interface ChipProps {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}

export function Chip({ active = false, onClick, children, className }: ChipProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] transition-all duration-[120ms]',
        active
          ? 'border-gold bg-gold-soft text-gold'
          : 'border-border-subtle bg-transparent text-text-secondary hover:border-text-tertiary hover:text-text-primary',
        className,
      )}
    >
      {children}
    </button>
  );
}
