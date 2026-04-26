import type { JSX } from 'react';

/**
 * Row in the About section on Settings. Visual reference:
 * `apps/design/src/routes/dashboard/settings/index.tsx` — `<AboutSection>` row.
 */
export function AboutRow({
  label,
  value,
  last,
}: {
  label: string;
  value: string;
  last?: boolean;
}): JSX.Element {
  return (
    <div
      className={`flex items-center gap-4 px-5 py-3 ${last ? '' : 'border-b border-border-subtle'}`}
    >
      <span className="shrink-0 w-[170px] font-mono text-[10px] tracking-[0.15em] leading-3 uppercase text-text-tertiary">
        {label}
      </span>
      <span className="flex-1 min-w-0 font-mono text-xs leading-4 text-text-primary">{value}</span>
    </div>
  );
}
