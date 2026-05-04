/**
 * Spec 0071: top-of-section radio for picking the active backend.
 *
 * Today only `claude-code` is in the catalog so the radio is a single option;
 * the component is built to accept N options for future Codex/Gemini.
 */

import type { JSX } from 'react';
import type { BackendListItem } from '@/lib/use-backends';

export interface ActiveBackendSelectorProps {
  backends: BackendListItem[];
  activeId: string | null;
  onChange: (id: string) => void;
}

export function ActiveBackendSelector({
  backends,
  activeId,
  onChange,
}: ActiveBackendSelectorProps): JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      {backends.map((b) => {
        const checked = b.id === activeId;
        const isConfigured = b.status !== 'not_configured';
        return (
          <button
            key={b.id}
            type="button"
            onClick={() => onChange(b.id)}
            className="flex items-center gap-3 px-4 py-3.5 bg-panel border border-border-subtle rounded-md hover:border-border-strong transition-colors text-left"
          >
            <div
              className={`w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 ${
                checked ? 'border border-gold' : 'border border-text-tertiary'
              }`}
            >
              {checked ? <span className="w-1.5 h-1.5 rounded-full bg-gold" /> : null}
            </div>
            <span className="font-mono text-[13px] text-text-primary">{b.id}</span>
            <span className="font-mono text-[11px] tracking-[0.08em] uppercase text-text-secondary ml-auto">
              {checked && isConfigured
                ? 'selected · used for chat + crons'
                : checked
                  ? 'awaiting credentials · click configure to start'
                  : 'available'}
            </span>
          </button>
        );
      })}
    </div>
  );
}
