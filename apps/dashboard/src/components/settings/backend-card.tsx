import { Dot } from '@zeno/ui';
import type { JSX } from 'react';

interface BackendCardProps {
  name: string;
  selectedVia: string;
}

export function BackendCard({ name }: BackendCardProps): JSX.Element {
  return (
    <div className="relative flex items-center justify-between border border-border-subtle bg-panel px-6 py-5">
      <span className="absolute top-0 left-0 h-full w-0.5 bg-gold" />
      <div>
        <div className="font-mono text-[15px] font-medium text-text-primary">{name}</div>
        <div className="mt-1 text-[13px] leading-snug text-text-secondary">
          Claude Agent SDK · OAuth · 300s timeout · <span className="text-text-primary">gh</span> +{' '}
          <span className="text-text-primary">claude</span> CLI verified at boot
        </div>
      </div>
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap border border-[rgba(107,211,163,0.3)] bg-[rgba(107,211,163,0.10)] px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-status-active">
        <Dot tone="active" pulse />
        active
      </span>
    </div>
  );
}
