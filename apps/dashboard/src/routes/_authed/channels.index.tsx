import { createFileRoute, Link } from '@tanstack/react-router';
import type { JSX } from 'react';
import { useState } from 'react';
import { ChannelsCatalogInstallModal } from '@/components/channels/channels-catalog-install-modal';
import { DashboardTopstrip } from '@/components/layout/dashboard-topstrip';
import {
  type ChannelCatalogEntry,
  type ChannelListItem,
  useChannels,
  useChannelsCatalog,
} from '@/lib/use-channels';

/**
 * Spec 0059: /channels list page. Mirrors the visual language of /connectors
 * but trimmed for the channel-shape: no transport pill, no tools count, no
 * MCP-specific bits.
 *
 * Two states (per Paper artboards):
 *   - CH3 empty state: hero icon + "Zeno is listening to nothing yet" + Install Slack CTA
 *   - CH1 populated:   "installed" section with one card per channel,
 *                       then "catalog" section with available + planned channels
 *
 * StatusPill is copied verbatim from connectors.index.tsx (variant 'off',
 * NOT 'disabled' which connectors.$id.tsx uses). The DB-status to pill
 * mapping is also copied from connectors.index.tsx lines 152-159.
 *
 * iconUrl is derived client-side by joining /api/channels list with
 * /api/channels/catalog on catalogId — the list endpoint omits iconUrl
 * per spec 0057's narrow projection. Catalog is wrapped in `{ channels: [...] }`
 * (NOT a flat array — see use-channels.ts header).
 */
export const Route = createFileRoute('/_authed/channels/')({
  component: ChannelsListScreen,
});

function ChannelsListScreen(): JSX.Element {
  const channels = useChannels();
  const catalog = useChannelsCatalog();
  const [installOpen, setInstallOpen] = useState(false);

  const installed = channels.data ?? [];
  const catalogEntries = catalog.data ?? [];
  const empty = !channels.isLoading && installed.length === 0;

  return (
    <>
      <DashboardTopstrip crumbs={[{ label: 'channels', current: true }]} />
      <main className="px-[54px] py-12 flex flex-col gap-10 max-w-[1440px] mx-auto">
        <PageHeader onInstall={() => setInstallOpen(true)} showInstallButton={!empty} />
        {empty ? (
          <EmptyState onInstall={() => setInstallOpen(true)} />
        ) : (
          <>
            <InstalledSection installed={installed} catalog={catalogEntries} />
            <CatalogSection
              catalog={catalogEntries}
              installed={installed}
              onInstall={() => setInstallOpen(true)}
            />
          </>
        )}
      </main>
      <ChannelsCatalogInstallModal
        open={installOpen}
        onClose={() => setInstallOpen(false)}
        catalog={catalogEntries}
      />
    </>
  );
}

function PageHeader({
  onInstall,
  showInstallButton,
}: {
  onInstall: () => void;
  showInstallButton: boolean;
}): JSX.Element {
  return (
    <header className="flex flex-row items-end justify-between gap-8">
      <div className="flex flex-col gap-2 max-w-[720px]">
        <span className="font-mono text-[11px] tracking-[0.12em] uppercase text-text-tertiary">
          transport · input/output
        </span>
        <h1 className="m-0 font-display text-5xl font-medium tracking-[-0.02em] leading-[1.1] text-text-primary">
          channels
        </h1>
        <p className="m-0 font-sans text-sm leading-snug text-text-secondary">
          Where the operator talks to Zeno and Zeno talks back. Channels are stored per-profile in
          the database; tokens live in{' '}
          <code className="font-mono text-xs text-gold">connector_secrets</code>, never in{' '}
          <code className="font-mono text-xs text-gold">.env</code>.
        </p>
      </div>
      {showInstallButton ? (
        <button
          type="button"
          onClick={onInstall}
          className="shrink-0 inline-flex items-center gap-2 px-4 h-9 bg-gold border border-gold-line rounded font-mono text-xs font-semibold tracking-[0.06em] uppercase text-canvas hover:bg-gold-bright transition-colors duration-[120ms]"
        >
          <PlusIcon />
          install channel
        </button>
      ) : null}
    </header>
  );
}

function PlusIcon(): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      width={13}
      height={13}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function EmptyState({ onInstall }: { onInstall: () => void }): JSX.Element {
  return (
    <section className="bg-panel border border-border-subtle rounded-lg flex flex-col items-center justify-center gap-7 px-10 py-20 min-h-[480px]">
      <div className="flex flex-col items-center gap-[18px]">
        <div className="flex items-center justify-center w-[88px] h-[88px] bg-canvas border border-border-subtle rounded-2xl">
          <svg
            aria-hidden="true"
            width={44}
            height={44}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-text-tertiary"
          >
            <path d="M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-4 4v-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
          </svg>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-text-tertiary" />
          <span className="font-mono text-[11px] tracking-[0.06em] uppercase text-text-tertiary">
            no channel installed
          </span>
        </div>
      </div>
      <div className="flex flex-col items-center gap-2 max-w-[540px] text-center">
        <h2 className="m-0 font-display text-[28px] font-medium leading-[34px] tracking-[-0.01em] text-text-primary">
          Zeno is listening to nothing yet.
        </h2>
        <p className="m-0 font-sans text-sm leading-snug text-text-secondary">
          Install a channel so the operator can mention{' '}
          <code className="font-mono text-xs text-gold">@zeno-agent</code> and the worker can reply.
          Slack is the only one available today — Telegram and WhatsApp will land in future specs.
        </p>
      </div>
      <button
        type="button"
        onClick={onInstall}
        className="inline-flex items-center gap-2 px-[18px] h-10 bg-gold border border-gold-line rounded font-mono text-xs font-semibold tracking-[0.06em] uppercase text-canvas hover:bg-gold-bright transition-colors duration-[120ms]"
      >
        <PlusIcon />
        install slack
      </button>
      <div className="flex items-center gap-1.5 pt-2">
        <InfoDotIcon />
        <span className="font-mono text-[11px] text-text-tertiary">
          Tokens land in <span className="text-text-secondary">connector_secrets</span> · never in{' '}
          <span className="text-text-secondary">.env</span>
        </span>
      </div>
    </section>
  );
}

function InfoDotIcon(): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      width={11}
      height={11}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-text-tertiary"
    >
      <circle cx={12} cy={12} r={10} />
      <line x1={12} y1={16} x2={12} y2={12} />
      <line x1={12} y1={8} x2={12.01} y2={8} />
    </svg>
  );
}

function InstalledSection({
  installed,
  catalog,
}: {
  installed: ChannelListItem[];
  catalog: ChannelCatalogEntry[];
}): JSX.Element {
  const counts = installed.reduce(
    (acc, ch) => {
      // visualStatus mapping copied from connectors.index.tsx lines 152-159
      const v =
        ch.status === 'enabled'
          ? ch.lastError
            ? 'error'
            : 'active'
          : ch.status === 'disabled'
            ? 'off'
            : 'pending';
      if (v === 'active') acc.active++;
      else if (v === 'error') acc.error++;
      else if (v === 'pending') acc.pending++;
      else acc.off++;
      return acc;
    },
    { active: 0, error: 0, off: 0, pending: 0 },
  );

  const summary = [
    counts.active > 0 ? `${counts.active} active` : null,
    counts.error > 0 ? `${counts.error} error` : null,
    counts.pending > 0 ? `${counts.pending} pending` : null,
    counts.off > 0 ? `${counts.off} off` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between border-b border-border-subtle pb-3">
        <h2 className="m-0 font-mono text-lg font-medium tracking-[-0.005em] leading-[22px] text-text-primary">
          installed
        </h2>
        <span className="font-mono text-[11px] tracking-[0.06em] uppercase text-text-tertiary">
          {summary || `${installed.length} installed`}
        </span>
      </div>
      <div className="flex flex-col gap-3">
        {installed.map((ch) => (
          <ChannelRow key={ch.id} channel={ch} catalog={catalog} />
        ))}
      </div>
    </section>
  );
}

function ChannelRow({
  channel,
  catalog,
}: {
  channel: ChannelListItem;
  catalog: ChannelCatalogEntry[];
}): JSX.Element {
  const catalogEntry = catalog.find((e) => e.id === channel.catalogId);
  const iconUrl = catalogEntry?.iconUrl ?? null;
  // visualStatus mapping copied from connectors.index.tsx lines 152-159
  const visualStatus =
    channel.status === 'enabled'
      ? channel.lastError
        ? 'error'
        : 'active'
      : channel.status === 'disabled'
        ? 'off'
        : 'pending';
  const lastVerifiedLabel = channel.lastVerifiedAt
    ? formatRelative(channel.lastVerifiedAt)
    : channel.status === 'pending'
      ? 'never tested'
      : '—';
  return (
    <Link
      to="/channels/$id"
      params={{ id: channel.id }}
      className="bg-panel border border-border-subtle rounded-md px-6 py-5 flex items-center gap-4 hover:border-gold-line transition-colors duration-[120ms] cursor-pointer"
    >
      <div className="shrink-0 w-10 h-10 bg-panel-2 rounded-md flex items-center justify-center">
        {iconUrl ? (
          <img src={iconUrl} alt={channel.displayName} width={22} height={22} />
        ) : (
          <span className="font-mono text-sm font-semibold text-text-tertiary">
            {channel.displayName.slice(0, 1).toUpperCase()}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1 flex-1 min-w-0">
        <span className="font-mono text-base font-medium text-text-primary truncate">
          {channel.displayName}
        </span>
        <span className="font-mono text-xs text-text-secondary truncate">
          {channel.description ?? channel.slug}
        </span>
      </div>
      <StatusPill status={visualStatus} />
      <div className="flex flex-col items-end gap-0.5 min-w-[100px] shrink-0">
        <span className="font-mono text-[11px] tracking-[0.06em] uppercase text-text-tertiary">
          last verified
        </span>
        <span className="font-mono text-xs text-text-secondary">{lastVerifiedLabel}</span>
      </div>
      <div className="shrink-0 inline-flex items-center gap-1.5 px-3 h-7 border border-border-subtle rounded font-mono text-[11px] tracking-[0.06em] uppercase text-text-secondary">
        manage
        <svg
          aria-hidden="true"
          width={10}
          height={10}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12h14M13 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  );
}

function CatalogSection({
  catalog,
  installed,
  onInstall,
}: {
  catalog: ChannelCatalogEntry[];
  installed: ChannelListItem[];
  onInstall: () => void;
}): JSX.Element {
  const installedIds = new Set(installed.map((c) => c.catalogId));
  const installedCount = catalog.filter((e) => installedIds.has(e.id)).length;
  const totalAvailable = catalog.length;
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between border-b border-border-subtle pb-3">
        <h2 className="m-0 font-mono text-lg font-medium tracking-[-0.005em] leading-[22px] text-text-primary">
          catalog
        </h2>
        <span className="font-mono text-[11px] tracking-[0.06em] uppercase text-text-tertiary">
          {totalAvailable} available · more coming
        </span>
      </div>
      <div className="flex flex-wrap gap-4">
        {catalog.map((entry) => (
          <CatalogChannelCard
            key={entry.id}
            entry={entry}
            isInstalled={installedIds.has(entry.id)}
            onInstall={onInstall}
          />
        ))}
        {totalAvailable === 0 && installedCount === 0 ? (
          <span className="font-mono text-xs text-text-tertiary">channels catalog unavailable</span>
        ) : null}
      </div>
    </section>
  );
}

function CatalogChannelCard({
  entry,
  isInstalled,
  onInstall,
}: {
  entry: ChannelCatalogEntry;
  isInstalled: boolean;
  onInstall: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => !isInstalled && onInstall()}
      disabled={isInstalled}
      className={`group/card w-[320px] shrink-0 border rounded-md px-5 py-[18px] flex flex-col gap-3 transition-colors duration-[120ms] text-left bg-panel ${
        isInstalled
          ? 'border-border-subtle opacity-60 cursor-not-allowed'
          : 'border-border-subtle hover:border-gold-line cursor-pointer'
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span className="shrink-0 w-7 h-7 inline-flex items-center justify-center bg-panel-2 rounded">
          {entry.iconUrl ? (
            <img src={entry.iconUrl} alt={entry.name} width={16} height={16} />
          ) : (
            <span className="font-mono text-xs font-semibold text-text-tertiary">
              {entry.name.slice(0, 1).toUpperCase()}
            </span>
          )}
        </span>
        <span className="flex-1 font-mono text-sm font-medium text-text-primary truncate">
          {entry.name}
        </span>
        {isInstalled ? (
          <span className="shrink-0 inline-flex items-center px-2 py-0.5 bg-gold/[0.08] border border-gold-line rounded-full font-mono text-[9px] tracking-[0.08em] uppercase text-gold">
            installed
          </span>
        ) : null}
      </div>
      <p className="m-0 flex-1 font-sans text-xs leading-relaxed text-text-secondary">
        {entry.description ?? '—'}
      </p>
      <div className="flex items-center justify-between pt-1">
        <span className="font-mono text-[11px] text-text-tertiary">
          {entry.secrets.length} secret{entry.secrets.length === 1 ? '' : 's'}
        </span>
        <span
          className={`font-mono text-[11px] tracking-[0.06em] uppercase ${
            isInstalled ? 'text-text-tertiary' : 'text-gold'
          }`}
        >
          {isInstalled ? 'already installed' : 'install →'}
        </span>
      </div>
    </button>
  );
}

// StatusPill — copied verbatim from connectors.index.tsx (variant 'off',
// NOT 'disabled' which connectors.$id.tsx uses). Per spec 0059 Track 4
// "Reused primitives", we adopt the index.tsx signature as canonical.
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

// formatRelative — copied verbatim from connectors.index.tsx ~line 483.
// Spec 0059 accepts a 4th copy of this helper (same pattern in
// connectors.$id.tsx, connectors.github-app.tsx). Future extraction to a
// shared lib is a deferred refactor.
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
