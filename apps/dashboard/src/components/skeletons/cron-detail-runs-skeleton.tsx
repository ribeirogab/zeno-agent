import { Skeleton } from '@zeno/ui';
import type { JSX } from 'react';

const ROW_KEYS = Array.from({ length: 5 }, (_, i) => `cron-run-skel-${i}`);

/**
 * Layout-shaped placeholder for the cron run-history list. Visual reference:
 * `apps/design/src/routes/dashboard/crons/detail/index.tsx` — `<RunHistorySkeleton>`.
 */
export function CronDetailRunsSkeleton(): JSX.Element {
  return (
    <div className="bg-panel border border-border-subtle py-1 flex flex-col">
      {ROW_KEYS.map((k) => (
        <div key={k} className="flex items-center gap-4 px-5 py-2.5">
          <Skeleton className="h-1.5 w-1.5 rounded-full" />
          <Skeleton className="h-3 w-[140px]" />
          <Skeleton className="h-3 w-10" />
          <Skeleton className="h-3 flex-1" />
          <Skeleton className="h-2.5 w-10" />
        </div>
      ))}
    </div>
  );
}
