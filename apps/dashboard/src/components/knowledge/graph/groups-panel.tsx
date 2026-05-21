import type { JSX } from 'react';
import type { GroupColor } from './types';

interface GroupsPanelProps {
  groups: GroupColor[];
}

export function GroupsPanel({ groups }: GroupsPanelProps): JSX.Element {
  if (groups.length === 0) {
    return <p className="font-mono text-[12px] text-text-tertiary">no groups</p>;
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {groups.map((g) => (
        <li key={g.group} className="flex items-center gap-2 font-mono text-[12px]">
          <span
            aria-hidden="true"
            className="inline-block h-3 w-3 rounded-full"
            style={{ backgroundColor: g.color }}
          />
          <span className="text-text-secondary">
            {g.group === '?ghost' ? 'unresolved' : g.group || '(root)'}
          </span>
        </li>
      ))}
    </ul>
  );
}
