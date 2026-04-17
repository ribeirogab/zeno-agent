import { Skeleton } from '@zeno/ui';
import type { JSX } from 'react';

const ROW_KEYS = Array.from({ length: 5 }, (_, index) => `session-skeleton-${index}`);

export function SessionListSkeleton(): JSX.Element {
  return (
    <div className="flex flex-col gap-px">
      {ROW_KEYS.map((key) => (
        <div key={key} className="flex h-14 items-center gap-6 border-b border-panel py-3">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
