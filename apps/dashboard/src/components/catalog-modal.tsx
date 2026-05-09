/**
 * `CatalogModal` — browse-catalog overlay (artboard A2).
 *
 * Spec: vault/specs/2026-05-08-connectors-cli-first-design (Phase 4 / Task 22).
 *
 * Renders a 2-column grid of catalog cards. Per spec Q9:
 *   - The card body opens `docsUrl` in a new tab.
 *   - The `+` button opens a nested `CommandModal` with the install command.
 *
 * Per spec Q5, catalogs that declare `multiInstance: false` (e.g. playwright)
 * disable the `+` button + show a single-instance banner once at least one
 * instance exists. Filter/Sort controls are present visually but not yet
 * wired — their behavior lands later in Phase 4.
 *
 * The modal uses `Dialog` + `DialogContent` from `@zeno/ui`, which already
 * portals via Radix and handles outside-click + Escape close.
 */

import { Dialog, DialogContent, DialogTitle } from '@zeno/ui';
import { type JSX, useMemo, useState } from 'react';
import { CommandModal } from '@/components/command-modal';
import { IcoPlus, IcoSearch, IcoX } from '@/components/icons';
import type { CatalogEntryApi } from '@/lib/use-catalog';
import type { ConnectorListEntry } from '@/lib/use-connectors';

interface CatalogModalProps {
  catalog: CatalogEntryApi[];
  installed: ConnectorListEntry[];
  loading?: boolean;
  onClose: () => void;
}

export function CatalogModal({
  catalog,
  installed,
  loading,
  onClose,
}: CatalogModalProps): JSX.Element {
  const [query, setQuery] = useState('');
  const [installCatalogId, setInstallCatalogId] = useState<string | null>(null);

  const installedCounts = useMemo(() => buildInstalledCounts(installed), [installed]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter(
      (entry) =>
        entry.id.toLowerCase().includes(q) ||
        entry.name.toLowerCase().includes(q) ||
        entry.description.toLowerCase().includes(q),
    );
  }, [catalog, query]);

  const totalInstalled = useMemo(
    () => filtered.reduce((acc, entry) => acc + (installedCounts.get(entry.id) ?? 0), 0),
    [filtered, installedCounts],
  );

  const handleOpenChange = (open: boolean): void => {
    if (!open) onClose();
  };

  return (
    <>
      <Dialog open onOpenChange={handleOpenChange}>
        <DialogContent
          aria-label="Catalog"
          width="w-[880px] max-w-[calc(100vw-48px)]"
          className="rounded-lg border border-border-strong"
        >
          <DialogTitle className="sr-only">Browse catalog</DialogTitle>
          <Header onClose={onClose} />
          <div className="px-7 pb-7 flex flex-col gap-5">
            <SearchBar value={query} onChange={setQuery} />
            <SubHead total={filtered.length} totalInstalled={totalInstalled} />
            <Grid
              entries={filtered}
              installedCounts={installedCounts}
              loading={loading}
              onInstall={setInstallCatalogId}
            />
          </div>
        </DialogContent>
      </Dialog>
      {installCatalogId && (
        <CommandModal
          spec={{ kind: 'install', catalogId: installCatalogId }}
          onClose={() => setInstallCatalogId(null)}
        />
      )}
    </>
  );
}

function Header({ onClose }: { onClose: () => void }): JSX.Element {
  return (
    <div className="px-7 pt-7 pb-2 flex items-start justify-between gap-3">
      <div className="flex flex-col">
        <span className="font-mono text-[11px] font-medium tracking-[0.18em] leading-[14px] uppercase text-gold">
          browse
        </span>
        <h2 className="font-serif text-[28px] font-normal tracking-[-0.015em] leading-9 text-text-primary mt-1 m-0">
          catalog
        </h2>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="close"
        className="shrink-0 inline-flex h-8 w-8 items-center justify-center bg-panel-2 border border-border-subtle text-text-tertiary transition-colors duration-[120ms] hover:text-text-primary hover:border-border-strong rounded"
      >
        <IcoX size={14} />
      </button>
    </div>
  );
}

function SearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}): JSX.Element {
  return (
    <div className="flex items-center gap-2.5">
      <label className="flex items-center gap-2 flex-1 px-3.5 py-2 bg-canvas border border-border-subtle">
        <IcoSearch size={14} className="text-text-tertiary" />
        <input
          type="text"
          placeholder="search catalog…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 bg-transparent border-0 outline-none font-mono text-[12px] leading-4 text-text-primary placeholder:text-text-tertiary"
          aria-label="search catalog"
        />
      </label>
      <PlaceholderControl label="filter by" />
      <PlaceholderControl label="sort by" />
    </div>
  );
}

function PlaceholderControl({ label }: { label: string }): JSX.Element {
  return (
    <button
      type="button"
      // Filter/Sort are visual placeholders until the catalog endpoint
      // exposes the filter shape — disable to avoid surprising clicks.
      disabled
      className="shrink-0 inline-flex items-center gap-2 px-3 py-2 bg-canvas border border-border-subtle font-mono text-[11px] tracking-[0.04em] leading-3 text-text-tertiary cursor-not-allowed"
    >
      {label}
      <span aria-hidden>▾</span>
    </button>
  );
}

function SubHead({
  total,
  totalInstalled,
}: {
  total: number;
  totalInstalled: number;
}): JSX.Element {
  return (
    <div className="flex items-baseline justify-between font-mono text-[11px] tracking-[0.08em] leading-3 text-text-tertiary">
      <span>
        available · {total} {total === 1 ? 'connector' : 'connectors'}
      </span>
      <span>{totalInstalled} installed</span>
    </div>
  );
}

function Grid({
  entries,
  installedCounts,
  loading,
  onInstall,
}: {
  entries: CatalogEntryApi[];
  installedCounts: Map<string, number>;
  loading: boolean | undefined;
  onInstall: (catalogId: string) => void;
}): JSX.Element {
  if (loading) {
    return (
      <div className="px-2 py-6 text-center font-mono text-[11px] tracking-[0.1em] uppercase text-text-tertiary">
        loading…
      </div>
    );
  }
  if (entries.length === 0) {
    return (
      <div className="px-2 py-6 text-center font-mono text-[11px] tracking-[0.1em] uppercase text-text-tertiary">
        no matches
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3">
      {entries.map((entry) => (
        <CatalogCard
          key={entry.id}
          entry={entry}
          installedCount={installedCounts.get(entry.id) ?? 0}
          onInstall={() => onInstall(entry.id)}
        />
      ))}
    </div>
  );
}

function CatalogCard({
  entry,
  installedCount,
  onInstall,
}: {
  entry: CatalogEntryApi;
  installedCount: number;
  onInstall: () => void;
}): JSX.Element {
  // Spec Q5: when `multiInstance: false` AND there is already an installation,
  // the `+` button is disabled and a tooltip-banner row is shown below the
  // card. Most catalogs have `multiInstance: true`, so the button stays live.
  const singleBlocked = entry.multiInstance === false && installedCount >= 1;
  const statusLabel = installedCount === 0 ? 'available' : `${installedCount} installed`;
  const isApp = entry.customInstallComponent === 'github-app';
  const isSingle = entry.multiInstance === false;

  return (
    <div className="flex flex-col">
      <div className="bg-panel border border-border-subtle px-4 py-3.5 flex items-start gap-3">
        <button
          type="button"
          onClick={() => window.open(entry.docsUrl, '_blank', 'noopener,noreferrer')}
          aria-label={`Open ${entry.name} docs`}
          className="flex items-start gap-3 flex-1 min-w-0 text-left bg-transparent border-0 p-0 cursor-pointer"
        >
          <span className="shrink-0 w-9 h-9 inline-flex items-center justify-center bg-panel-2 border border-gold-line rounded-[6px]">
            <img src={entry.iconUrl} alt="" width={20} height={20} />
          </span>
          <div className="flex flex-col min-w-0 gap-1">
            <span className="flex items-center gap-2 min-w-0">
              <span className="font-mono text-[13px] font-medium tracking-[0.02em] leading-4 text-text-primary truncate">
                {entry.id}
              </span>
              {isApp && <Tag>app</Tag>}
              {isSingle && <Tag>single</Tag>}
            </span>
            <span className="font-mono text-[11px] tracking-[0.04em] leading-4 text-text-secondary line-clamp-2">
              {entry.description}
            </span>
            <span className="font-mono text-[10px] tracking-[0.08em] leading-3 text-text-tertiary mt-0.5">
              {statusLabel}
            </span>
          </div>
        </button>
        <button
          type="button"
          onClick={onInstall}
          disabled={singleBlocked}
          aria-label={`Install ${entry.name}`}
          className={`shrink-0 inline-flex h-8 w-8 items-center justify-center bg-panel-2 border border-border-subtle text-text-primary transition-colors duration-[120ms] rounded ${
            singleBlocked
              ? 'opacity-40 cursor-not-allowed'
              : 'hover:border-gold-line hover:bg-panel'
          }`}
        >
          <IcoPlus size={14} />
        </button>
      </div>
      {singleBlocked && (
        <div className="bg-panel-2 border border-t-0 border-border-subtle px-4 py-2 flex items-center gap-2 font-mono text-[10px] tracking-[0.06em] leading-3 text-text-tertiary">
          <span aria-hidden>ⓘ</span>
          single-instance catalog · already installed
        </div>
      )}
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 border border-border-subtle font-mono text-[9px] tracking-[0.1em] leading-3 uppercase text-text-tertiary rounded-sm">
      {children}
    </span>
  );
}

function buildInstalledCounts(entries: ConnectorListEntry[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    if (entry.kind === 'connector') {
      if (entry.catalogId) {
        counts.set(entry.catalogId, (counts.get(entry.catalogId) ?? 0) + 1);
      }
    } else if (entry.kind === 'connector_group') {
      counts.set(entry.catalogId, (counts.get(entry.catalogId) ?? 0) + entry.installationCount);
    } else {
      counts.set(entry.catalogId, (counts.get(entry.catalogId) ?? 0) + entry.installationCount);
    }
  }
  return counts;
}
