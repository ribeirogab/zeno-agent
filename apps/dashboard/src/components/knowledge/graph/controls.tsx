import { type JSX, useState } from 'react';
import { DisplayPanel } from './display-panel';
import { FiltersPanel } from './filters-panel';
import { GroupsPanel } from './groups-panel';
import type { DisplayState, FilterState, GraphResponse } from './types';

interface ControlsProps {
  raw: GraphResponse | undefined;
  filters: FilterState;
  onFiltersChange: (next: FilterState) => void;
  display: DisplayState;
  onDisplayChange: (next: DisplayState) => void;
}

type PanelKey = 'filters' | 'groups' | 'display' | null;

export function Controls(props: ControlsProps): JSX.Element {
  const [open, setOpen] = useState<PanelKey>(null);

  return (
    <div className="flex items-stretch gap-3 border-l border-border-subtle bg-panel pl-2 pr-3 py-3">
      <div className="flex flex-col gap-1">
        <PanelButton
          open={open === 'filters'}
          onClick={() => setOpen(open === 'filters' ? null : 'filters')}
          label="filters"
        />
        <PanelButton
          open={open === 'groups'}
          onClick={() => setOpen(open === 'groups' ? null : 'groups')}
          label="groups"
        />
        <PanelButton
          open={open === 'display'}
          onClick={() => setOpen(open === 'display' ? null : 'display')}
          label="display"
        />
      </div>
      {open !== null && (
        <div className="w-[260px] border-l border-border-subtle pl-3">
          {open === 'filters' && (
            <FiltersPanel
              raw={props.raw}
              value={props.filters}
              onChange={props.onFiltersChange}
            />
          )}
          {open === 'groups' && <GroupsPanel groups={props.raw?.groups ?? []} />}
          {open === 'display' && (
            <DisplayPanel value={props.display} onChange={props.onDisplayChange} />
          )}
        </div>
      )}
    </div>
  );
}

function PanelButton({
  open,
  onClick,
  label,
}: {
  open: boolean;
  onClick: () => void;
  label: string;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        open
          ? 'rounded px-2 py-1 font-mono text-[11px] uppercase bg-gold-soft text-gold'
          : 'rounded px-2 py-1 font-mono text-[11px] uppercase text-text-secondary hover:text-text-primary'
      }
    >
      {label}
    </button>
  );
}
