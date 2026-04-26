import type { JSX } from 'react';

export interface BackendCardProps {
  name: string;
  /** Short copy under the name, e.g. "Claude Agent SDK · OAuth · 300s timeout". */
  summary: string;
}

/**
 * Backend section card. Visual reference:
 * `apps/design/src/routes/dashboard/settings/index.tsx` — `<BackendSection>`.
 */
export function BackendCard({ name, summary }: BackendCardProps): JSX.Element {
  return (
    <div className="relative bg-panel border border-border-subtle px-6 py-5 flex items-center justify-between gap-4">
      <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-gold" />
      <div>
        <div className="font-mono text-[15px] font-medium tracking-[0.02em] leading-[18px] text-text-primary">
          {name}
        </div>
        <div className="mt-1 font-sans text-[13px] leading-5 text-text-secondary">{summary}</div>
      </div>
      <span className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 bg-status-active/[0.10] border border-status-active/30 font-mono text-[10px] font-semibold tracking-[0.18em] leading-3 uppercase text-status-active">
        <span className="w-1.5 h-1.5 rounded-full bg-status-active" />
        active
      </span>
    </div>
  );
}
