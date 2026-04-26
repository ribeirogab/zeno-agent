import { Skeleton } from '@zeno/ui';
import type { JSX } from 'react';

const ACTIVITY_KEYS = Array.from({ length: 6 }, (_, i) => `activity-skeleton-${i}`);
const NEXT_KEYS = Array.from({ length: 3 }, (_, i) => `next-skeleton-${i}`);
const STAT_KEYS = Array.from({ length: 4 }, (_, i) => `stat-skeleton-${i}`);

/**
 * Layout-shaped placeholder for the home page. Matches the populated shape so
 * mounting/unmounting doesn't shift content. Visual reference:
 * `apps/design/src/routes/dashboard/home/index.tsx` — `<HomeSkeleton>`.
 */
export function HomeSkeleton(): JSX.Element {
  return (
    <>
      <header className="flex flex-col gap-4 pt-2.5 pb-1">
        <Skeleton className="h-3.5 w-[280px]" />
        <Skeleton className="h-14 w-[480px]" />
        <Skeleton className="h-3 w-[440px]" />
        <Skeleton className="h-3 w-[380px]" />
      </header>
      <section className="grid grid-cols-4 gap-px bg-border-subtle border border-border-subtle">
        {STAT_KEYS.map((k) => (
          <div key={k} className="bg-panel px-5 pt-5 pb-[18px] flex flex-col gap-2.5">
            <Skeleton className="h-3 w-[80px]" />
            <Skeleton className="h-10 w-[60px]" />
            <Skeleton className="h-2.5 w-[100px]" />
          </div>
        ))}
      </section>
      <div className="grid grid-cols-[1.55fr_1fr] gap-6">
        <div className="bg-panel border border-border-subtle py-1">
          {ACTIVITY_KEYS.map((k) => (
            <div key={k} className="flex items-center gap-4 px-5 py-2.5">
              <Skeleton className="h-1.5 w-1.5 rounded-full" />
              <Skeleton className="h-3 w-[70px]" />
              <Skeleton className="h-3 w-[120px]" />
              <Skeleton className="h-3 flex-1" />
            </div>
          ))}
        </div>
        <div className="bg-panel border border-border-subtle px-5 py-4.5 flex flex-col gap-3.5">
          {NEXT_KEYS.map((k) => (
            <div key={k} className="flex items-center gap-3 py-2.5">
              <Skeleton className="h-5 w-[62px]" />
              <div className="flex-1 flex flex-col gap-1">
                <Skeleton className="h-3 w-[140px]" />
                <Skeleton className="h-2.5 w-[180px]" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/**
 * Activity-only skeleton for the activity stream pane. Used when only the
 * activity feed is loading but the rest of the page is populated.
 */
export function HomeActivitySkeleton(): JSX.Element {
  return (
    <>
      {ACTIVITY_KEYS.map((k) => (
        <div key={k} className="flex items-center gap-4 px-5 py-2.5">
          <Skeleton className="h-1.5 w-1.5 rounded-full" />
          <Skeleton className="h-3 w-[70px]" />
          <Skeleton className="h-3 w-[120px]" />
          <Skeleton className="h-3 flex-1" />
        </div>
      ))}
    </>
  );
}
