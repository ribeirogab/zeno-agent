import type { JSX } from 'react';
import { Losango } from '@zeno/ui';

interface NextCronItemProps {
  countdown: string;
  name: string;
  meta: string;
  highlight?: boolean;
}

export function NextCronItem({
  countdown,
  name,
  meta,
  highlight = false,
}: NextCronItemProps): JSX.Element {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="min-w-[62px] shrink-0 font-serif text-[20px] italic text-gold">
        {countdown}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={`font-mono text-[13px] font-medium ${highlight ? 'text-gold' : 'text-text-primary'}`}
        >
          {name}
        </span>
        <span className="font-mono text-[10px] text-text-tertiary">{meta}</span>
      </div>
      <Losango />
    </div>
  );
}
