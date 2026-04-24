import type { JSX } from 'react';

interface AboutRowProps {
  label: string;
  value: string;
}

export function AboutRow({ label, value }: AboutRowProps): JSX.Element {
  return (
    <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-2.5 last:border-b-0">
      <span className="w-[170px] shrink-0 font-mono text-xs uppercase tracking-[0.15em] text-text-tertiary">
        {label}
      </span>
      <span className="flex-1 font-mono text-xs text-text-primary">{value}</span>
    </div>
  );
}
