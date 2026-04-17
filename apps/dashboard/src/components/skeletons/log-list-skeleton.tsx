import { Skeleton } from '@zeno/ui';
import type { JSX } from 'react';

const ROW_KEYS = Array.from({ length: 8 }, (_, index) => `log-skeleton-${index}`);

export function LogListSkeleton(): JSX.Element {
  return (
    <div className="flex flex-col gap-px">
      {ROW_KEYS.map((key) => (
        <div key={key} className="flex h-10 items-center gap-4 border-b border-panel py-2">
          <Skeleton className="h-1.5 w-1.5 rounded-full" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-3 w-48" />
          <Skeleton className="h-3 flex-1" />
        </div>
      ))}
    </div>
  );
}
