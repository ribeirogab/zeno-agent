import { Skeleton } from '@zeno/ui';
import type { JSX } from 'react';

const ROW_KEYS = Array.from({ length: 5 }, (_, index) => `cron-skeleton-${index}`);

export function CronListSkeleton(): JSX.Element {
  return (
    <div className="flex flex-col">
      {ROW_KEYS.map((key) => (
        <div
          key={key}
          className="flex items-center gap-4 border-b border-border-subtle px-5 py-3.5"
        >
          <div className="flex flex-1 flex-col gap-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-4 w-40 shrink-0" />
          <Skeleton className="h-3 w-[140px] shrink-0" />
          <Skeleton className="h-5 w-[90px] shrink-0" />
          <Skeleton className="h-5 w-[108px] shrink-0" />
          <Skeleton className="h-4 w-[150px] shrink-0" />
        </div>
      ))}
    </div>
  );
}
