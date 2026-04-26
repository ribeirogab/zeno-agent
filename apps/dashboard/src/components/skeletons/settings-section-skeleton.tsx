import { Skeleton } from '@zeno/ui';
import type { JSX } from 'react';

/**
 * Layout-shaped placeholder for one section of Settings. Visual reference:
 * `apps/design/src/routes/dashboard/settings/index.tsx` — `<SectionSkeleton>`.
 */
export function SettingsSectionSkeleton({
  title,
  rows = 3,
}: {
  title: string;
  rows?: number;
}): JSX.Element {
  const keys = Array.from({ length: rows }, (_, i) => `${title}-skel-${i}`);
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between border-b border-dashed border-border-subtle pb-2.5">
        <h2 className="m-0 font-sans text-lg font-medium tracking-[-0.005em] leading-[22px] text-text-primary">
          {title}
        </h2>
        <Skeleton className="h-3 w-[200px]" />
      </div>
      <div className="bg-panel border border-border-subtle flex flex-col">
        {keys.map((k, i) => (
          <div
            key={k}
            className={`flex items-center gap-4 px-5 py-3 ${
              i === keys.length - 1 ? '' : 'border-b border-border-subtle'
            }`}
          >
            <Skeleton className="h-3 w-[140px]" />
            <Skeleton className="h-3 flex-1" />
            <Skeleton className="h-3 w-[80px]" />
          </div>
        ))}
      </div>
    </section>
  );
}
