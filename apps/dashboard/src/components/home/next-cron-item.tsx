import { Losango } from '@zeno/ui';
import type { JSX } from 'react';

export interface NextCronItemProps {
  /** Big italic countdown, e.g. "in 23m" */
  when: string;
  /** Cron name */
  name: string;
  /** Mono meta line: "today · 21:00 · #zeno" */
  meta: string;
  /** Whether this is the soonest scheduled item (gold name color). */
  soon?: boolean;
  /** True for the first item — drops the top dashed divider. */
  first?: boolean;
}

/**
 * One row in the "what's next" panel on Home. Visual reference:
 * `apps/design/src/routes/dashboard/home/index.tsx` — `<NextItem>`.
 */
export function NextCronItem({
  when,
  name,
  meta,
  soon = false,
  first = false,
}: NextCronItemProps): JSX.Element {
  return (
    <div
      className={`flex items-center gap-3 py-2.5 ${
        first ? '' : 'border-t border-dashed border-border-subtle'
      }`}
    >
      <span className="font-serif text-[20px] italic text-gold min-w-[62px] whitespace-nowrap">
        {when}
      </span>
      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <span
          className={`font-mono text-[13px] font-medium tracking-[0.02em] truncate ${
            soon ? 'text-gold' : 'text-text-primary'
          }`}
        >
          {name}
        </span>
        <span className="font-mono text-[10px] text-text-tertiary tracking-[0.04em] truncate">
          {meta}
        </span>
      </div>
      <Losango color="var(--color-gold)" />
    </div>
  );
}
