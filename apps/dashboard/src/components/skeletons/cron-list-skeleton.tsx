import { Skeleton } from '@zeno/ui';
import type { JSX } from 'react';

const ROW_KEYS = Array.from({ length: 5 }, (_, index) => `cron-skeleton-${index}`);

export function CronListSkeleton(): JSX.Element {
  return (
    <div className="flex flex-col gap-px">
      {ROW_KEYS.map((key) => (
        <div key={key} className="flex h-12 items-center gap-6 border-b border-panel px-0 py-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="ml-auto h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}
