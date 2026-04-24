import { Dot, Pill } from '@zeno/ui';
import type { JSX } from 'react';

interface BackendCardProps {
  name: string;
  selectedVia: string;
}

export function BackendCard({ name, selectedVia }: BackendCardProps): JSX.Element {
  return (
    <div className="relative flex items-center justify-between border border-border-subtle bg-panel px-5 py-4">
      <span className="absolute top-0 left-0 h-full w-0.5 bg-gold" />
      <div>
        <div className="font-mono text-[15px] text-text-primary">{name}</div>
        <div className="mt-1 text-sm text-text-secondary">
          Claude Agent SDK · OAuth · 300s timeout ·{' '}
          <span className="text-text-primary">gh</span> +{' '}
          <span className="text-text-primary">claude</span> CLI verified at boot
        </div>
      </div>
      <Pill tone="active">
        <Dot tone="active" pulse className="mr-1.5" />
        active
      </Pill>
    </div>
  );
}
