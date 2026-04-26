import { createFileRoute, Link } from '@tanstack/react-router';
import type { JSX } from 'react';
import { useState } from 'react';
import { CatalogInstallModal } from '@/components/connectors/catalog-install-modal';
import { DashboardTopstrip } from '@/components/layout/dashboard-topstrip';
import { useCatalog } from '@/lib/use-catalog';
import { type ConnectorListItem, useConnectors } from '@/lib/use-connectors';

export const Route = createFileRoute('/_authed/connectors/')({
  component: ConnectorsListScreen,
});

function ConnectorsListScreen(): JSX.Element {
  const connectors = useConnectors();
  const catalog = useCatalog();
  const [installCatalogId, setInstallCatalogId] = useState<string | null>(null);

  const installed = connectors.data ?? [];
  const catalogEntries = catalog.data ?? [];
  const empty = !connectors.isLoading && installed.length === 0;
  const counts = {
    enabled: installed.filter((c) => c.status === 'enabled' && !c.lastError).length,
    error: installed.filter((c) => c.status === 'enabled' && c.lastError).length,
    disabled: installed.filter((c) => c.status === 'disabled').length,
    pending: installed.filter((c) => c.status === 'pending').length,
  };

  return (
    <div className="flex min-h-screen bg-canvas">
      <main className="flex-1 flex flex-col overflow-auto">
        <DashboardTopstrip crumbs={[{ label: 'connectors', current: true }]} />
        <div className="max-w-[1080px] w-full mx-auto px-12 pt-10 pb-20 flex flex-col gap-8 min-w-0">
          <Header empty={empty} />
          {!empty && (
            <InstalledSection
              installed={installed}
              loading={connectors.isLoading}
              counts={counts}
            />
          )}
          <CatalogSection
            entries={catalogEntries}
            loading={catalog.isLoading}
            error={catalog.error}
            onInstall={(id) => setInstallCatalogId(id)}
          />
        </div>
      </main>
      {installCatalogId && (
        <CatalogInstallModal
          catalogId={installCatalogId}
          onClose={() => setInstallCatalogId(null)}
        />
      )}
    </div>
  );
}

function Header({ empty }: { empty: boolean }): JSX.Element {
  return (
    <header className="flex items-end justify-between gap-6 border-b border-border-subtle pb-6">
      <div className="flex flex-col flex-1">
        <span className="font-mono text-[11px] font-medium tracking-[0.18em] leading-[14px] uppercase text-gold">
          external tools · mcp
        </span>
        <h1 className="font-sans text-[32px] font-medium tracking-[-0.015em] leading-10 text-text-primary mt-2 m-0">
          connectors
        </h1>
        <p className="mt-2.5 max-w-[620px] m-0 font-sans text-sm leading-[1.6] text-text-secondary">
          {empty
            ? 'Connect Zeno to external tools. Pick from the catalog below — secrets are stored per-profile in the database.'
            : "MCP servers connected to Zeno's agent backend."}
        </p>
      </div>
    </header>
  );
}

function InstalledSection({
  installed,
  loading,
  counts,
}: {
  installed: ConnectorListItem[];
  loading: boolean;
  counts: { enabled: number; error: number; disabled: number; pending: number };
}): JSX.Element {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between border-b border-dashed border-border-subtle pb-2.5">
        <h2 className="m-0 font-sans text-lg font-medium tracking-[-0.005em] leading-[22px] text-text-primary">
          installed
        </h2>
        <span className="font-mono text-[10px] tracking-[0.2em] leading-3 uppercase text-text-tertiary">
          {loading
            ? 'loading…'
            : `${counts.enabled} active · ${counts.error} error · ${counts.pending} pending · ${counts.disabled} off`}
        </span>
      </div>
      <div className="bg-panel border border-border-subtle flex flex-col min-w-0 overflow-x-auto">
        <Thead />
        {installed.map((connector, i) => (
          <Row key={connector.id} c={connector} last={i === installed.length - 1} />
        ))}
      </div>
    </section>
  );
}

function Thead(): JSX.Element {
  return (
    <div className="flex items-center gap-4 px-5 py-3 border-b border-border-subtle bg-sidebar font-mono text-[10px] tracking-[0.18em] leading-3 uppercase text-text-tertiary min-w-[820px]">
      <span className="flex-1 min-w-0 pl-11">connector</span>
      <span className="w-[90px] shrink-0">transport</span>
      <span className="w-[140px] shrink-0">status</span>
      <span className="w-[140px] shrink-0">last verified</span>
      <span className="w-6 shrink-0" />
    </div>
  );
}

function Row({ c, last }: { c: ConnectorListItem; last: boolean }): JSX.Element {
  const baseClasses = `flex items-center gap-4 px-5 py-3.5 ${
    last ? '' : 'border-b border-border-subtle'
  } min-w-[820px] cursor-pointer transition-colors duration-[120ms] hover:bg-panel-2`;
  const muted = c.status === 'disabled';
  const visualStatus =
    c.status === 'enabled'
      ? c.lastError
        ? 'error'
        : 'active'
      : c.status === 'disabled'
        ? 'off'
        : 'pending';
  const lastVerifiedLabel = c.lastVerifiedAt
    ? formatRelative(c.lastVerifiedAt)
    : c.status === 'pending'
      ? 'never tested'
      : '—';
  const detail =
    visualStatus === 'error' && c.lastError ? c.lastError : `${c.toolCount} tools · ${c.source}`;
  return (
    <Link to="/connectors/$id" params={{ id: c.id }} className={baseClasses}>
      <div className={`flex items-center gap-3 flex-1 min-w-0 ${muted ? 'opacity-60' : ''}`}>
        <Icon connector={c} />
        <div className="flex flex-col gap-[2px] min-w-0">
          <span
            className={`font-mono text-[13px] font-medium tracking-[0.02em] leading-4 truncate ${
              muted ? 'text-text-secondary' : 'text-text-primary'
            }`}
          >
            {c.displayName}
          </span>
          <span
            className={`font-mono text-[10px] tracking-[0.04em] leading-3 truncate ${
              visualStatus === 'error' ? 'text-status-failed' : 'text-text-tertiary'
            }`}
          >
            {detail}
          </span>
        </div>
      </div>
      <span className="w-[90px] shrink-0 inline-flex">
        <OutlinePill>{c.transport}</OutlinePill>
      </span>
      <span className="w-[140px] shrink-0 inline-flex">
        <StatusPill status={visualStatus} />
      </span>
      <span
        className={`w-[140px] shrink-0 font-mono text-[11px] leading-[14px] ${
          c.status === 'pending' ? 'italic text-text-tertiary' : 'text-text-tertiary'
        }`}
      >
        {lastVerifiedLabel}
      </span>
      <span className="w-6 shrink-0 text-center font-mono text-xs leading-4 text-text-tertiary">
        ⋯
      </span>
    </Link>
  );
}

function Icon({ connector }: { connector: ConnectorListItem }): JSX.Element {
  const initial = connector.displayName.slice(0, 1).toUpperCase();
  if (connector.iconUrl) {
    // Brand SVGs are self-contained app-icon tiles (their own bg + rounded
    // corners + logo). Render the image at full tile size so the brand
    // background fills the visible 32x32 area.
    return (
      <img
        src={connector.iconUrl}
        alt={connector.displayName}
        width={32}
        height={32}
        className="shrink-0 w-8 h-8 block"
      />
    );
  }
  const dashed = connector.status === 'pending';
  return (
    <span
      className={`shrink-0 w-8 h-8 inline-flex items-center justify-center bg-panel-2 ${
        dashed ? 'border border-dashed border-gold-line' : 'border border-gold-line'
      } font-mono text-sm font-semibold leading-[18px] text-gold`}
    >
      {initial}
    </span>
  );
}

function OutlinePill({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <span className="inline-flex items-center px-2 py-0.5 border border-border-subtle font-mono text-[10px] tracking-[0.1em] leading-3 uppercase text-text-tertiary">
      {children}
    </span>
  );
}

function StatusPill({ status }: { status: 'active' | 'error' | 'off' | 'pending' }): JSX.Element {
  const config = {
    active: {
      cls: 'bg-status-active/[0.06] border border-status-active/30 text-status-active',
      dot: 'bg-status-active',
      label: 'active',
    },
    error: {
      cls: 'bg-status-failed/[0.06] border border-status-failed/30 text-status-failed',
      dot: 'bg-status-failed',
      label: 'error',
    },
    off: {
      cls: 'bg-panel-2 border border-border-subtle text-text-tertiary',
      dot: 'bg-text-tertiary',
      label: 'off',
    },
    pending: {
      cls: 'bg-gold/10 border border-gold-line text-gold',
      dot: 'bg-gold',
      label: 'pending',
    },
  }[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-[3px] font-mono text-[10px] tracking-[0.1em] leading-3 uppercase ${config.cls}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

interface CatalogEntryRow {
  id: string;
  name: string;
  description: string;
  iconUrl: string;
  transport: string;
  isInstalled: boolean;
}

function CatalogSection({
  entries,
  loading,
  error,
  onInstall,
}: {
  entries: CatalogEntryRow[];
  loading: boolean;
  error: unknown;
  onInstall: (id: string) => void;
}): JSX.Element {
  const errored = error !== null && error !== undefined;
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between border-b border-dashed border-border-subtle pb-2.5">
        <h2 className="m-0 font-sans text-lg font-medium tracking-[-0.005em] leading-[22px] text-text-primary">
          catalog
        </h2>
        <span className="font-mono text-[10px] tracking-[0.2em] leading-3 uppercase text-text-tertiary">
          {loading ? 'loading…' : `${entries.length} curated`}
        </span>
      </div>
      {errored ? (
        <div className="bg-status-failed/[0.06] border border-status-failed/30 text-status-failed px-4 py-3 font-mono text-[11px]">
          failed to load catalog. check the API logs.
        </div>
      ) : null}
      <div className="flex flex-wrap gap-4">
        {entries.map((entry) => (
          <CatalogCard
            key={entry.id}
            item={entry}
            onClick={() => !entry.isInstalled && onInstall(entry.id)}
          />
        ))}
      </div>
    </section>
  );
}

function CatalogCard({
  item,
  onClick,
}: {
  item: CatalogEntryRow;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={item.isInstalled}
      className={`group/card w-[308px] shrink-0 border px-[18px] py-[18px] flex flex-col gap-3 transition-colors duration-[120ms] text-left bg-panel ${
        item.isInstalled
          ? 'border-border-subtle opacity-60 cursor-not-allowed'
          : 'border-border-subtle hover:border-gold-line cursor-pointer'
      }`}
    >
      <div className="flex items-center gap-3 w-full">
        <img
          src={item.iconUrl}
          alt={item.name}
          width={32}
          height={32}
          className="shrink-0 w-8 h-8 block"
        />
        <span className="flex-1 min-w-0 font-mono text-[13px] font-medium tracking-[0.02em] leading-4 text-text-primary truncate">
          {item.name}
        </span>
        <span className="shrink-0 inline-flex items-center px-2 py-0.5 border border-border-subtle font-mono text-[9px] tracking-[0.1em] leading-3 uppercase text-text-tertiary">
          {item.transport}
        </span>
      </div>
      <p className="m-0 flex-1 font-sans text-[13px] leading-5 text-text-secondary">
        {item.description}
      </p>
      <span
        className={`font-mono text-[10px] tracking-[0.08em] leading-3 uppercase ${
          item.isInstalled ? 'text-text-tertiary' : 'text-gold'
        }`}
      >
        {item.isInstalled ? 'installed' : 'install →'}
      </span>
    </button>
  );
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'just now';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
