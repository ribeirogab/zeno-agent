import { Skeleton } from '@zeno/ui';
import type { JSX } from 'react';

const ROW_KEYS = Array.from({ length: 5 }, (_, i) => `session-row-skel-${i}`);

/**
 * Layout-shaped placeholder for the sessions table. Visual reference:
 * `apps/design/src/components/skeleton/sessions-table-skeleton.tsx`.
 */
export function SessionsTableSkeleton(): JSX.Element {
  return (
    <div className="bg-panel border border-border-subtle flex flex-col min-w-0 overflow-x-auto">
      <div className="flex items-center gap-4 px-5 py-3 border-b border-border-subtle bg-sidebar font-mono text-[10px] tracking-[0.18em] uppercase text-text-tertiary min-w-[840px]">
        <span className="flex-1 min-w-0">channel · thread</span>
        <span className="w-[280px] shrink-0">last user message</span>
        <span className="w-[120px] shrink-0">last activity</span>
        <span className="w-[70px] shrink-0">msgs</span>
        <span className="w-[128px] shrink-0">backend</span>
      </div>
      {ROW_KEYS.map((k) => (
        <div
          key={k}
          className="flex items-center gap-4 px-5 py-3.5 border-b border-border-subtle min-w-[840px]"
        >
          <div className="flex-1 min-w-0 flex flex-col gap-1.5">
            <Skeleton className="h-3 w-[200px]" />
            <Skeleton className="h-2.5 w-[140px]" />
          </div>
          <Skeleton className="w-[260px] h-3 shrink-0" />
          <div className="w-[120px] shrink-0 flex flex-col gap-1.5">
            <Skeleton className="h-3 w-[80px]" />
            <Skeleton className="h-2.5 w-[60px]" />
          </div>
          <Skeleton className="w-[40px] h-3 shrink-0" />
          <div className="w-[128px] shrink-0 flex items-center gap-1.5">
            <Skeleton className="w-1.5 h-1.5 rounded-full" />
            <Skeleton className="h-3 w-[80px]" />
          </div>
        </div>
      ))}
    </div>
  );
}
