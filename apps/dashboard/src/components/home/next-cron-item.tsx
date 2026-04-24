import { Losango } from '@zeno/ui';
import type { JSX } from 'react';

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
    <div className="zen-next-item">
      <span className="zen-next-countdown">{countdown}</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
        <span
          className="zen-card-title"
          style={{ color: highlight ? 'var(--color-gold)' : 'var(--color-text-primary)' }}
        >
          {name}
        </span>
        <span className="zen-mono-sm">{meta}</span>
      </div>
      <Losango />
    </div>
  );
}
