import type { JSX, ReactNode } from 'react';
import { cn } from '../utils';

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
    <div className={cn('flex flex-col items-center gap-2 px-6 py-12 text-center', className)}>
      <span className="text-sm font-medium text-text-primary">{title}</span>
      {description ? (
        <span className="max-w-xs text-xs leading-5 text-text-tertiary">{description}</span>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
