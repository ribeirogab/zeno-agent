import { type JSX, useMemo } from 'react';
import type { FilterState, GraphResponse } from './types';

interface FiltersPanelProps {
  raw: GraphResponse | undefined;
  value: FilterState;
  onChange: (next: FilterState) => void;
}

export function FiltersPanel({ raw, value, onChange }: FiltersPanelProps): JSX.Element {
  const allTags = useMemo(() => {
    if (!raw) return [];
    const s = new Set<string>();
    for (const n of raw.nodes) for (const t of n.tags) s.add(t);
    return Array.from(s).sort();
  }, [raw]);

  const allFolders = useMemo(() => {
    if (!raw) return [];
    const s = new Set<string>();
    for (const n of raw.nodes) if (n.group !== '?ghost') s.add(n.group);
    return Array.from(s).sort();
  }, [raw]);

  const toggleTag = (tag: string) => {
    const next = value.tags.includes(tag)
      ? value.tags.filter((t) => t !== tag)
      : [...value.tags, tag];
    onChange({ ...value, tags: next });
  };

  const toggleFolder = (folder: string) => {
    const next = value.folders.includes(folder)
      ? value.folders.filter((f) => f !== folder)
      : [...value.folders, folder];
    onChange({ ...value, folders: next });
  };

  return (
    <div className="flex flex-col gap-3">
      <input
        type="search"
        value={value.search}
        onChange={(e) => onChange({ ...value, search: e.target.value })}
        placeholder="search labels…"
        className="rounded border border-border-subtle bg-panel-2 px-2 py-1 font-mono text-[12px]"
      />
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
              className={
                value.tags.includes(tag)
                  ? 'rounded border border-gold bg-gold-soft px-2 py-0.5 font-mono text-[11px] text-gold'
                  : 'rounded border border-border-subtle bg-panel-2 px-2 py-0.5 font-mono text-[11px] text-text-secondary hover:text-text-primary'
              }
            >
              #{tag}
            </button>
          ))}
        </div>
      )}
      {allFolders.length > 0 && (
        <details>
          <summary className="cursor-pointer font-mono text-[11px] uppercase text-text-tertiary">
            folders ({value.folders.length === 0 ? 'all' : value.folders.length})
          </summary>
          <div className="mt-2 flex flex-col gap-1">
            {allFolders.map((folder) => (
              <label key={folder} className="flex items-center gap-2 font-mono text-[12px]">
                <input
                  type="checkbox"
                  checked={value.folders.includes(folder)}
                  onChange={() => toggleFolder(folder)}
                  className="accent-gold"
                />
                {folder || '(root)'}
              </label>
            ))}
          </div>
        </details>
      )}
      <label className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wide text-text-tertiary">
        <input
          type="checkbox"
          checked={value.showMeta}
          onChange={(e) => onChange({ ...value, showMeta: e.target.checked })}
          className="accent-gold"
        />
        show meta files
      </label>
      <label className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wide text-text-tertiary">
        <input
          type="checkbox"
          checked={value.existingOnly}
          onChange={(e) => onChange({ ...value, existingOnly: e.target.checked })}
          className="accent-gold"
        />
        existing files only
      </label>
      <label className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wide text-text-tertiary">
        <input
          type="checkbox"
          checked={value.showOrphans}
          onChange={(e) => onChange({ ...value, showOrphans: e.target.checked })}
          className="accent-gold"
        />
        show orphans
      </label>
    </div>
  );
}
