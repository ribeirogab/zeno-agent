import type { JSX } from 'react';
import { cn } from '../utils';

export interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps): JSX.Element {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-panel', className)}
      aria-busy="true"
      aria-live="polite"
    />
  );
}
