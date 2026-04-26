import { Skeleton } from '@zeno/ui';
import type { JSX } from 'react';

const ROW_KEYS = Array.from({ length: 5 }, (_, i) => `crons-skel-${i}`);

/**
 * Layout-shaped placeholder for the crons table. Visual reference:
 * `apps/design/src/components/skeleton/crons-table-skeleton.tsx`.
 */
export function CronsTableSkeleton(): JSX.Element {
  return (
    <div className="border border-border-subtle bg-panel min-w-0 overflow-x-auto">
      <div className="flex items-center gap-4 px-5 py-3 border-b border-border-subtle bg-sidebar font-mono text-[10px] tracking-[0.18em] uppercase text-text-tertiary min-w-[840px]">
        <span className="flex-1 min-w-0">name</span>
        <span className="w-[160px] shrink-0">schedule</span>
        <span className="w-[140px] shrink-0">next run</span>
        <span className="w-[90px] shrink-0">source</span>
        <span className="w-[108px] shrink-0">status</span>
        <span className="w-[150px] shrink-0 text-right">actions</span>
      </div>
      {ROW_KEYS.map((k) => (
        <div
          key={k}
          className="flex items-center gap-4 px-5 py-3.5 border-b border-border-subtle min-w-[840px]"
        >
          <div className="flex-1 min-w-0 flex flex-col gap-1.5">
            <Skeleton className="h-3 w-[180px]" />
            <Skeleton className="h-2.5 w-[260px]" />
          </div>
          <div className="w-[160px] shrink-0 flex flex-col gap-1.5">
            <Skeleton className="h-3 w-[120px]" />
            <Skeleton className="h-2.5 w-[100px]" />
          </div>
          <div className="w-[140px] shrink-0 flex flex-col gap-1.5">
            <Skeleton className="h-3 w-[80px]" />
            <Skeleton className="h-2.5 w-[110px]" />
          </div>
          <Skeleton className="w-[60px] h-4 shrink-0" />
          <Skeleton className="w-[80px] h-4 shrink-0" />
          <div className="w-[150px] shrink-0 flex justify-end gap-1.5">
            <Skeleton className="h-5 w-10" />
            <Skeleton className="h-5 w-12" />
            <Skeleton className="h-5 w-8" />
          </div>
        </div>
      ))}
    </div>
  );
}
