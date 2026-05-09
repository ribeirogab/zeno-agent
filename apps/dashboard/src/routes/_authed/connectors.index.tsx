import { createFileRoute, Link } from '@tanstack/react-router';
import type { JSX } from 'react';
import { useState } from 'react';
import { CatalogInstallModal } from '@/components/connectors/catalog-install-modal';
import { DashboardTopstrip } from '@/components/layout/dashboard-topstrip';
import { useCatalog } from '@/lib/use-catalog';
import {
  type AppListItem,
  type ConnectorListEntry,
  type ConnectorListItem,
  useConnectors,
} from '@/lib/use-connectors';

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
  // Spec 0045: counts span both connector rows and app rows. App rows
  // contribute their installation children to the count (so a 4-installation
  // App reads as 4 active in the headline).
  const counts = installed.reduce(
    (acc, entry) => {
      if (entry.kind === 'connector') {
        if (entry.status === 'enabled' && !entry.lastError) acc.enabled++;
        else if (entry.status === 'enabled' && entry.lastError) acc.error++;
        else if (entry.status === 'disabled') acc.disabled++;
        else if (entry.status === 'pending') acc.pending++;
      } else {
        for (const inst of entry.installations) {
          if (inst.status === 'enabled' && !inst.lastError) acc.enabled++;
          else if (inst.status === 'enabled' && inst.lastError) acc.error++;
          else if (inst.status === 'disabled') acc.disabled++;
          else if (inst.status === 'pending') acc.pending++;
        }
      }
      return acc;
    },
    { enabled: 0, error: 0, disabled: 0, pending: 0 },
  );

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
  installed: ConnectorListEntry[];
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
        {installed.map((entry, i) => {
          const last = i === installed.length - 1;
          if (entry.kind === 'app') {
            return <AppRow key={`app-${entry.appUuid}`} app={entry} last={last} />;
          }
          return <Row key={entry.id} c={entry} last={last} />;
        })}
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

// Spec 0045 → 2026-05-08: collapsed App row in C7. Links to the unified
// `/connectors/:catalogId/:id` route (App detail layout, artboard A6a).
function AppRow({ app, last }: { app: AppListItem; last: boolean }): JSX.Element {
  const baseClasses = `flex items-center gap-4 px-5 py-3.5 ${
    last ? '' : 'border-b border-border-subtle'
  } min-w-[820px] cursor-pointer transition-colors duration-[120ms] hover:bg-panel-2`;
  // Spec 0048 Q2: 'degraded' renders an amber pill distinct from 'pending'.
  const visualStatus: 'active' | 'error' | 'pending' | 'degraded' =
    app.statusAggregate === 'active'
      ? 'active'
      : app.statusAggregate === 'error'
        ? 'error'
        : app.statusAggregate === 'degraded'
          ? 'degraded'
          : 'pending';
  const lastVerifiedLabel = app.lastVerifiedAt ? formatRelative(app.lastVerifiedAt) : '—';
  const detail = `${app.installationCount} installations · github · catalog`;
  // R3-restart F1: when there are zero installations, the "0/0 active" label
  // contradicts the gold/pending pill styling. Show "no installations" instead.
  // Spec 0048 Q2: a 'degraded' status (refresh failing) overrides the count.
  const aggregateLabel = (() => {
    if (visualStatus === 'degraded') return 'refresh failing';
    if (app.installationCount === 0) return 'no installations';
    const enabledCount = app.installations.filter(
      (i) => i.status === 'enabled' && !i.lastError,
    ).length;
    return `${enabledCount}/${app.installationCount} active`;
  })();
  return (
    <Link
      to="/connectors/$catalogId/$id"
      params={{ catalogId: app.catalogId, id: app.appUuid }}
      className={baseClasses}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <AppIcon iconUrl={app.iconUrl} count={app.installationCount} appName={app.appName} />
        <div className="flex flex-col gap-[2px] min-w-0">
          <span className="font-mono text-[13px] font-medium tracking-[0.02em] leading-4 truncate text-text-primary">
            GitHub App ·{' '}
            <span className="italic text-gold not-italic-prevention">{app.appName}</span>
          </span>
          <span className="font-mono text-[10px] tracking-[0.04em] leading-3 truncate text-text-tertiary">
            {detail}
          </span>
        </div>
      </div>
      <span className="w-[90px] shrink-0 inline-flex">
        <OutlinePill>app</OutlinePill>
      </span>
      <span className="w-[140px] shrink-0 inline-flex">
        <AggregateStatusPill status={visualStatus} label={aggregateLabel} />
      </span>
      <span className="w-[140px] shrink-0 font-mono text-[11px] leading-[14px] text-text-tertiary">
        {lastVerifiedLabel}
      </span>
      <span className="w-6 shrink-0 text-center font-mono text-xs leading-4 text-text-tertiary">
        ⋯
      </span>
    </Link>
  );
}

function AppIcon({
  iconUrl,
  count,
  appName,
}: {
  iconUrl: string | null;
  count: number;
  appName: string;
}): JSX.Element {
  return (
    <span className="relative shrink-0 w-8 h-8 inline-flex items-center justify-center bg-text-primary border border-gold-line">
      {iconUrl ? (
        <img src={iconUrl} alt={appName} width={18} height={18} />
      ) : (
        <span className="font-mono text-sm font-semibold leading-[18px] text-gold">
          {appName.slice(0, 1).toUpperCase()}
        </span>
      )}
      {/* Spec 0045 C7: gold count badge in top-right corner */}
      <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center bg-gold border border-gold-line font-mono text-[10px] font-semibold leading-[10px] text-text-ink">
        {count}
      </span>
    </span>
  );
}

function AggregateStatusPill({
  status,
  label,
}: {
  status: 'active' | 'error' | 'pending' | 'degraded';
  label: string;
}): JSX.Element {
  const config = {
    active: {
      cls: 'bg-status-active/[0.06] border border-status-active/30 text-status-active',
      dot: 'bg-status-active',
    },
    error: {
      cls: 'bg-status-failed/[0.06] border border-status-failed/30 text-status-failed',
      dot: 'bg-status-failed',
    },
    pending: {
      cls: 'bg-gold/10 border border-gold-line text-gold',
      dot: 'bg-gold',
    },
    // Spec 0048 Q2: degraded = transient refresh failure, distinct from
    // 'pending' (configuration not done) and 'error' (hard failure).
    degraded: {
      cls: 'bg-[#C99F4F]/10 border border-[#C99F4F]/40 text-[#C99F4F]',
      dot: 'bg-[#C99F4F]',
    },
  }[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-[3px] font-mono text-[10px] tracking-[0.1em] leading-3 uppercase ${config.cls}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {label}
    </span>
  );
}

function Icon({ connector }: { connector: ConnectorListItem }): JSX.Element {
  const initial = connector.displayName.slice(0, 1).toUpperCase();
  if (connector.iconUrl) {
    return (
      <span className="shrink-0 w-8 h-8 inline-flex items-center justify-center bg-text-primary border border-gold-line">
        <img src={connector.iconUrl} alt={connector.displayName} width={18} height={18} />
      </span>
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
        <span className="shrink-0 w-8 h-8 inline-flex items-center justify-center bg-text-primary border border-gold-line">
          <img src={item.iconUrl} alt={item.name} width={18} height={18} />
        </span>
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
