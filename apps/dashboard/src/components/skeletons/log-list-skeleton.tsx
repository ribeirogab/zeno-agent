import { Skeleton } from '@zeno/ui';
import type { JSX } from 'react';

const ROW_KEYS = Array.from({ length: 8 }, (_, i) => `log-skel-${i}`);

/**
 * Layout-shaped placeholder for the logs list. Visual reference:
 * `apps/design/src/routes/dashboard/logs/index.tsx` — `<LogListSkeleton>`.
 */
export function LogListSkeleton(): JSX.Element {
  return (
    <div className="bg-panel border border-border-subtle py-1 flex flex-col min-w-0">
      {ROW_KEYS.map((k) => (
        <div key={k} className="flex items-center gap-4 px-5 py-2.5 min-w-[760px]">
          <Skeleton className="h-1.5 w-1.5 rounded-full" />
          <Skeleton className="h-3 w-[100px]" />
          <Skeleton className="h-3 w-10" />
          <Skeleton className="h-3 w-[160px]" />
          <Skeleton className="h-3 flex-1" />
          <Skeleton className="h-2.5 w-[110px]" />
        </div>
      ))}
    </div>
  );
}
