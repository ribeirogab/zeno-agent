import type { JSX } from 'react';
import { cn } from '../utils';
import { Button } from './button';

export interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = 'algo deu errado',
  description,
  onRetry,
  className,
}: ErrorStateProps): JSX.Element {
  return (
    <div className={cn('flex flex-col items-center gap-2 px-6 py-12 text-center', className)}>
      <span className="text-sm font-medium text-status-failed">{title}</span>
      {description ? (
        <span className="max-w-xs text-xs leading-5 text-text-tertiary">{description}</span>
      ) : null}
      {onRetry ? (
        <Button variant="ghost" size="sm" onClick={onRetry} className="mt-4">
          tentar de novo
        </Button>
      ) : null}
    </div>
  );
}
