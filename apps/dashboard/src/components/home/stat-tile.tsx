import type { JSX } from 'react';

interface StatTileProps {
  label: string;
  value: number;
}

export function StatTile({ label, value }: StatTileProps): JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium uppercase tracking-wider text-text-secondary">
        {label}
      </span>
      <span className="font-serif text-4xl leading-none text-text-primary">{value}</span>
    </div>
  );
}
