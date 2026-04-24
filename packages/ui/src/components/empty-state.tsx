import type { JSX, ReactNode } from 'react';
import { cn } from '../utils';
import { Crest } from './crest';

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: EmptyStateProps): JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3.5 border border-border-subtle bg-panel px-8 py-14 text-center',
        className,
      )}
    >
      <span className="text-gold/25">
        <Crest size={40} />
      </span>
      <h3 className="font-serif text-[22px] font-normal tracking-[-0.01em] text-text-primary">
        {title}
      </h3>
      {description && (
        <p className="max-w-[420px] text-[13px] text-text-secondary">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
