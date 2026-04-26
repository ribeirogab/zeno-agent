import { Skeleton } from '@zeno/ui';
import type { JSX } from 'react';

const ROW_KEYS = Array.from({ length: 4 }, (_, i) => `transcript-skel-${i}`);

/**
 * Layout-shaped placeholder for the session transcript view. Visual reference:
 * `apps/design/src/routes/dashboard/sessions/detail/index.tsx` — `<TranscriptSkeleton>`.
 */
export function SessionTranscriptSkeleton(): JSX.Element {
  return (
    <div className="bg-panel border border-border-subtle py-6 px-6 flex flex-col gap-4">
      {ROW_KEYS.map((k) => (
        <div key={k} className="flex items-start gap-4">
          <div className="shrink-0 w-20 pt-1 flex flex-col gap-[5px] items-end">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-2.5 w-14" />
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-2.5">
            <div className="bg-panel-2 border border-border-subtle border-l-2 border-l-border-strong px-3.5 py-2.5 flex flex-col gap-[6px]">
              <Skeleton className="h-3 w-full max-w-[640px]" />
              <Skeleton className="h-3 w-[60%]" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
