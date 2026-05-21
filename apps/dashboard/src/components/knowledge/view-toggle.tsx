import type { JSX } from 'react';

export type ViewMode = 'tree' | 'graph';

interface ViewToggleProps {
  value: ViewMode;
  onChange: (next: ViewMode) => void;
}

export function ViewToggle({ value, onChange }: ViewToggleProps): JSX.Element {
  return (
    <div className="inline-flex items-stretch rounded-md border border-border-subtle bg-panel-2 p-0.5 font-mono text-[11px] uppercase tracking-wide">
      <button
        type="button"
        aria-pressed={value === 'tree'}
        onClick={() => value !== 'tree' && onChange('tree')}
        className={
          value === 'tree'
            ? 'rounded px-3 py-1.5 bg-gold-soft text-gold'
            : 'rounded px-3 py-1.5 text-text-secondary hover:text-text-primary'
        }
      >
        Tree
      </button>
      <button
        type="button"
        aria-pressed={value === 'graph'}
        onClick={() => value !== 'graph' && onChange('graph')}
        className={
          value === 'graph'
            ? 'rounded px-3 py-1.5 bg-gold-soft text-gold'
            : 'rounded px-3 py-1.5 text-text-secondary hover:text-text-primary'
        }
      >
        Graph
      </button>
    </div>
  );
}
