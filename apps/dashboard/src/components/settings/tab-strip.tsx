import type { JSX } from 'react';

/**
 * Spec 0067 A: Imperial-Terminal-styled tab strip.
 *
 * Caps mono labels, gold underline + gold text on the active tab,
 * text-secondary on inactive (with a subtle hover lift). The strip
 * itself sits on a 1px border-subtle bottom rule so the active
 * underline visually replaces that segment.
 *
 * The component is presentation-only — the parent owns the active id
 * and routes click events. That keeps it reusable: the route uses
 * TanStack Router search params (`?tab=`); a future caller could wire
 * it to local state instead.
 */
export interface TabStripProps<TabId extends string> {
  tabs: ReadonlyArray<{ id: TabId; label: string }>;
  activeId: TabId;
  onChange: (id: TabId) => void;
}

export function TabStrip<TabId extends string>({
  tabs,
  activeId,
  onChange,
}: TabStripProps<TabId>): JSX.Element {
  return (
    <div className="flex border-b border-border-subtle">
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`relative px-5 py-3.5 font-mono text-[11px] font-medium tracking-[0.16em] uppercase transition-colors duration-[120ms] ${
              isActive ? 'text-gold' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {tab.label}
            {isActive ? (
              <span className="absolute -bottom-px left-0 right-0 h-0.5 bg-gold" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
