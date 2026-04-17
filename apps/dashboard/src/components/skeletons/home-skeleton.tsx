import { Skeleton } from '@zeno/ui';
import type { JSX } from 'react';

const ACTIVITY_KEYS = Array.from({ length: 5 }, (_, index) => `activity-skeleton-${index}`);

export function HomeActivitySkeleton(): JSX.Element {
  return (
    <div className="flex flex-col gap-px">
      {ACTIVITY_KEYS.map((key) => (
        <div key={key} className="flex h-12 items-center gap-4 border-b border-panel py-3">
          <Skeleton className="h-2 w-2 rounded-full" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 flex-1" />
        </div>
      ))}
    </div>
  );
}
